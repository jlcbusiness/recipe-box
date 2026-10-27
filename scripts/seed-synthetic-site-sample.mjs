import { spawnSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { LOCAL_TEST_PASSWORD } from '../tests/support/local-test-password.mjs';
import { findLocalOwner } from './synthetic-owner-selection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(root, 'tests/fixtures/recipe-box-synthetic-site-sample.json');
const testEmailSuffix = '@example.test';

function parseArguments(args) {
  if (args.includes('--help')) {
    return { help: true, dryRun: false };
  }
  if (args.some((argument) => !['--local', '--dry-run'].includes(argument))) {
    throw new Error('Supported arguments are --local and --dry-run.');
  }
  if (!args.includes('--local')) {
    throw new Error('This loader only supports local Supabase. Run it with --local.');
  }
  return { help: false, dryRun: args.includes('--dry-run') };
}

function readLocalEnvironment() {
  const result = spawnSync('supabase', ['status', '--output', 'env'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    throw new Error('Unable to read local Supabase status. Start the local stack first.');
  }

  const values = Object.fromEntries(
    result.stdout
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^"|"$/gu, '')];
      }),
  );
  const apiUrl = new URL(values.API_URL ?? '');
  if (
    apiUrl.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(apiUrl.hostname)
  ) {
    throw new Error('Refusing to connect: local Supabase must use a loopback HTTP address.');
  }
  if (!values.ANON_KEY || !values.SERVICE_ROLE_KEY || !values.JWT_SECRET) {
    throw new Error('Local Supabase did not provide the required local API credentials.');
  }

  return {
    apiUrl: apiUrl.origin,
    anonKey: values.ANON_KEY,
    serviceRoleKey: values.SERVICE_ROLE_KEY,
    jwtSecret: values.JWT_SECRET,
  };
}

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createOwnerToken(userId, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJwtPart({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJwtPart({
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + 600,
  });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function headersFor(key, token = key) {
  return { apikey: key, Authorization: `Bearer ${token}` };
}

async function requestJson(
  baseUrl,
  pathname,
  { headers, method = 'GET', body, extraHeaders } = {},
) {
  const response = await fetch(new URL(pathname, baseUrl), {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Local Supabase request to ${pathname.split('?')[0]} failed with HTTP ${response.status}.`,
    );
  }
  return text ? JSON.parse(text) : null;
}

function tablePath(table, filters) {
  const query = new URLSearchParams(filters);
  return `/rest/v1/${table}?${query.toString()}`;
}

function rpcPath(name) {
  return `/rest/v1/rpc/${name}`;
}

function stableUuid(seed) {
  const bytes = createHash('sha256').update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function ingredientSlug(name) {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function ingredientSetDefinitions(recipe, accountId, recipeUrl) {
  const sets = recipe.ingredientSets ?? [{ key: 'ingredients', label: 'Ingredients' }];
  return sets.map((set, position) => ({
    id: recipe.ingredientSets
      ? stableUuid(`${accountId}:${recipeUrl}:ingredient-set:${set.key}`)
      : stableUuid(`${accountId}:${recipeUrl}:ingredient-set`),
    key: set.key,
    label: set.label,
    position,
  }));
}

function ingredientMention(row, portionOrdinal) {
  const baseSlug =
    row.isNameRepeatedAcrossSets || row.portionOneRatio !== null
      ? `${ingredientSlug(row.name)}-${ingredientSlug(row.setLabel)}`
      : ingredientSlug(row.name);
  const portion = portionOrdinal === null ? '' : `:${portionOrdinal}`;
  const portionSlug = portionOrdinal === null ? '' : `-${portionOrdinal}`;
  return `[[ingredient:${row.id}${portion}|${baseSlug}${portionSlug}]]`;
}

function plainTemperature(temperature) {
  if (!temperature) return '';
  return temperature.kind === 'oven'
    ? `${temperature.value}°${temperature.unit}`
    : temperature.heat;
}

function temperatureMarker(temperature) {
  if (!temperature) return '';
  return temperature.kind === 'oven'
    ? `${temperature.unit}!${temperature.value}`
    : `!${temperature.heat}!`;
}

function makeInstructionSteps(recipe, accountId, recipeUrl, photoIds) {
  const ingredientSets = ingredientSetDefinitions(recipe, accountId, recipeUrl);
  const ingredientSetsByKey = new Map(ingredientSets.map((set) => [set.key, set]));
  const ingredientRows = new Map(
    recipe.ingredients.map((ingredient, index) => [
      ingredient.key,
      {
        id: stableUuid(`${accountId}:${recipeUrl}:ingredient:${index}`),
        name: ingredient.name,
        setKey: ingredient.setKey ?? ingredientSets[0].key,
        setLabel: ingredientSetsByKey.get(ingredient.setKey ?? ingredientSets[0].key)?.label,
        portionOneRatio: ingredient.portionOneRatio ?? null,
        isNameRepeatedAcrossSets: false,
      },
    ]),
  );
  const setKeysByIngredientName = new Map();
  for (const row of ingredientRows.values()) {
    const normalizedName = row.name.normalize('NFKC').trim().toLocaleLowerCase();
    const setKeys = setKeysByIngredientName.get(normalizedName) ?? new Set();
    setKeys.add(row.setKey);
    setKeysByIngredientName.set(normalizedName, setKeys);
  }
  for (const row of ingredientRows.values()) {
    const normalizedName = row.name.normalize('NFKC').trim().toLocaleLowerCase();
    row.isNameRepeatedAcrossSets = (setKeysByIngredientName.get(normalizedName)?.size ?? 0) > 1;
  }

  return recipe.instructions.map((text, position) => {
    const detail = recipe.instructionDetails[position];
    const references = detail.ingredientRefs.map((reference) => {
      const key = typeof reference === 'string' ? reference : reference.key;
      const row = ingredientRows.get(key);
      if (!row) throw new Error(`Fixture contains an unknown ingredient key in ${recipe.slug}.`);
      const portionOrdinal =
        typeof reference === 'string' ? null : (reference.portionOrdinal ?? null);
      if (portionOrdinal !== null && row.portionOneRatio === null) {
        throw new Error(
          `Fixture uses a portion reference without a divided ingredient in ${recipe.slug}.`,
        );
      }
      return { row, portionOrdinal };
    });
    const candidates = references.flatMap(({ row, portionOrdinal }) => {
      const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}])${escapeRegExp(row.name)}(?![\\p{L}\\p{N}])`,
        'giu',
      );
      const match = pattern.exec(text);
      return match
        ? [{ row, portionOrdinal, start: match.index, end: match.index + match[0].length }]
        : [];
    });
    candidates.sort((left, right) => left.start - right.start || right.end - left.end);

    const replacements = [];
    const referencedKeys = new Set();
    let coveredUntil = -1;
    for (const candidate of candidates) {
      if (candidate.start < coveredUntil) continue;
      replacements.push(candidate);
      referencedKeys.add(`${candidate.row.id}:${candidate.portionOrdinal ?? 0}`);
      coveredUntil = candidate.end;
    }

    let markdown = text;
    for (const replacement of replacements.toReversed()) {
      markdown =
        markdown.slice(0, replacement.start) +
        ingredientMention(replacement.row, replacement.portionOrdinal) +
        markdown.slice(replacement.end);
    }
    let plainText = text;
    for (const { row, portionOrdinal } of references) {
      if (!referencedKeys.has(`${row.id}:${portionOrdinal ?? 0}`)) {
        markdown += ` ${ingredientMention(row, portionOrdinal)}`;
        plainText += ` ${row.name}`;
      }
    }

    const temperature = temperatureMarker(detail.temperature);
    const readableTemperature = plainTemperature(detail.temperature);
    if (temperature) {
      markdown += ` ${temperature}`;
      plainText += ` ${readableTemperature}`;
    }
    if (detail.durationMinutes !== null) {
      const duration = `${detail.durationMinutes} minutes`;
      markdown += ` [[duration:${duration}]]`;
      plainText += ` ${duration}`;
    }

    for (const photoKey of detail.photoKeys) {
      const photo = recipe.photos.find((entry) => entry.key === photoKey);
      const photoId = photoIds.get(photoKey);
      if (!photo || !photoId || photo.kind !== 'instruction' || photo.stepIndex !== position) {
        throw new Error(`Fixture photo mapping is invalid for ${recipe.slug}.`);
      }
      const modifiers = [
        photo.alignment === 'right' ? '' : photo.alignment,
        `w${photo.width}`,
        photo.stepOnly ? 'steponly' : '',
        photo.noWrap ? 'nowrap' : '',
      ]
        .filter(Boolean)
        .map((modifier) => `-${modifier}`)
        .join('');
      markdown += `\n[[photo:${photoId}]]${modifiers}`;
    }

    return {
      id: stableUuid(`${accountId}:${recipeUrl}:step:${position}`),
      position,
      content_markdown: markdown,
      plain_text: plainText,
    };
  });
}

function recipePayload(
  recipe,
  publicationId,
  recipeUrl,
  accountId,
  picklists,
  recipeId,
  version,
  steps,
) {
  const lookup = (category, value) => {
    const id = picklists.get(`${category}:${value}`);
    if (!id) throw new Error(`Local account is missing the ${category} option "${value}".`);
    return id;
  };
  const ingredientSets = ingredientSetDefinitions(recipe, accountId, recipeUrl);
  const ingredientSetIdsByKey = new Map(ingredientSets.map((set) => [set.key, set.id]));
  const defaultIngredientSetKey = ingredientSets[0].key;
  const ingredientRows = recipe.ingredients.map((ingredient, position) => {
    const amount = Number(ingredient.amount);
    const ingredientSetId = ingredientSetIdsByKey.get(ingredient.setKey ?? defaultIngredientSetKey);
    if (!ingredientSetId) {
      throw new Error(`Fixture ingredient has an unknown section in ${recipe.slug}.`);
    }
    return {
      recipe_ingredient_id: stableUuid(`${accountId}:${recipeUrl}:ingredient:${position}`),
      ingredient_id: null,
      ingredient_name: ingredient.name,
      ingredient_set_id: ingredientSetId,
      portion_one_ratio: ingredient.portionOneRatio ?? null,
      size_value: ingredient.sizeValue ?? null,
      size_unit: ingredient.sizeUnit ?? null,
      position,
      is_main: position === 0,
      detail: ingredient.specifics ?? '',
      preparation: ingredient.preparation ?? '',
      measurements:
        Number.isFinite(amount) && amount > 0
          ? [
              {
                measurement_type: 'volume',
                amount_min: amount,
                amount_max: null,
                unit_code: 'cup',
                picklist_value_id: null,
              },
            ]
          : [],
    };
  });
  const state = recipe.state;

  return {
    p_recipe_id: recipeId,
    p_expected_version: version,
    p_name: recipe.name,
    p_food_type_id: lookup('food_type', recipe.foodType),
    p_state: state,
    p_verdict_id: state === 'tried' ? lookup('verdict', recipe.opinion.verdict) : null,
    p_enthusiasm_id:
      state === 'want_to_try' ? lookup('enthusiasm', recipe.opinion.enthusiasm) : null,
    p_occasion_details: recipe.opinion.occasionDetails,
    p_reason: state === 'will_not_try' ? recipe.opinion.reason : null,
    p_serves: recipe.serves,
    p_prep_time_minutes: recipe.times.prepMinutes,
    p_mixing_time_minutes: recipe.times.mixingMinutes,
    p_marinate_time_minutes: recipe.times.marinateMinutes,
    p_chill_time_minutes: recipe.times.chillMinutes,
    p_freeze_time_minutes: recipe.times.freezeMinutes,
    p_cook_time_minutes: recipe.times.cookMinutes,
    p_bake_time_minutes: recipe.times.bakeMinutes,
    p_cooling_time_minutes: recipe.times.coolingMinutes,
    p_rest_time_minutes: recipe.times.restMinutes,
    p_total_time_minutes: recipe.times.totalMinutes,
    p_notes_markdown: recipe.notesMarkdown,
    p_meal_type_ids: recipe.mealTypes.map((value) => lookup('meal_type', value)),
    p_cuisine_ids: recipe.cuisines.map((value) => lookup('cuisine', value)),
    p_equipment_ids: recipe.equipment.map((value) => lookup('equipment', value)),
    p_ingredient_rows: ingredientRows,
    p_instruction_steps: steps,
    p_publication_id: publicationId,
    p_publication_page: null,
    p_recipe_url: recipeUrl,
    p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
    p_tag_ids: [],
    p_ingredient_sets: ingredientSets.map(({ id, label, position }) => ({
      id,
      label,
      position,
    })),
  };
}

function sameSteps(existing, requested) {
  return (
    existing.length === requested.length &&
    existing.every(
      (step, index) =>
        step.position === requested[index].position &&
        step.content_markdown === requested[index].content_markdown &&
        step.plain_text === requested[index].plain_text,
    )
  );
}

function sameNumericValue(existing, requested) {
  if (existing === null || existing === undefined) {
    return requested === null || requested === undefined;
  }
  return requested !== null && requested !== undefined && Number(existing) === Number(requested);
}

async function sameIngredientData(api, accountId, recipeId, requestedRows, requestedSets) {
  const [existingSets, existingRows] = await Promise.all([
    api.table(
      'recipe_ingredient_sets',
      formatApiFilters({
        select: 'id,label,position',
        account_id: `eq.${accountId}`,
        recipe_id: `eq.${recipeId}`,
        order: 'position.asc',
      }),
    ),
    api.table(
      'recipe_ingredients',
      formatApiFilters({
        select:
          'id,ingredient_id,ingredient_set_id,position,is_main,detail,preparation,portion_one_ratio,size_value,size_unit',
        account_id: `eq.${accountId}`,
        recipe_id: `eq.${recipeId}`,
        order: 'position.asc',
      }),
    ),
  ]);
  if (
    existingSets.length !== requestedSets.length ||
    existingSets.some(
      (set, index) =>
        set.id !== requestedSets[index].id ||
        set.label !== requestedSets[index].label ||
        set.position !== requestedSets[index].position,
    ) ||
    existingRows.length !== requestedRows.length
  ) {
    return false;
  }

  const isUuid = (value) =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
  const ingredientIds = [...new Set(existingRows.map((row) => row.ingredient_id))];
  const recipeIngredientIds = existingRows.map((row) => row.id);
  if (ingredientIds.some((id) => !isUuid(id)) || recipeIngredientIds.some((id) => !isUuid(id))) {
    return false;
  }

  const [existingIngredients, existingMeasurements] = await Promise.all([
    ingredientIds.length === 0
      ? Promise.resolve([])
      : api.table(
          'ingredients',
          formatApiFilters({
            select: 'id,name',
            account_id: `eq.${accountId}`,
            id: `in.(${ingredientIds.join(',')})`,
          }),
        ),
    recipeIngredientIds.length === 0
      ? Promise.resolve([])
      : api.table(
          'recipe_ingredient_measurements',
          formatApiFilters({
            select:
              'recipe_ingredient_id,position,measurement_type,amount_min,amount_max,unit_code,picklist_value_id',
            account_id: `eq.${accountId}`,
            recipe_ingredient_id: `in.(${recipeIngredientIds.join(',')})`,
            order: 'position.asc',
          }),
        ),
  ]);
  const ingredientNames = new Map(
    existingIngredients.map((ingredient) => [ingredient.id, ingredient.name]),
  );
  const measurementsByIngredientId = new Map();
  for (const measurement of existingMeasurements) {
    const measurements = measurementsByIngredientId.get(measurement.recipe_ingredient_id) ?? [];
    measurements.push(measurement);
    measurementsByIngredientId.set(measurement.recipe_ingredient_id, measurements);
  }

  return existingRows.every((row, index) => {
    const requested = requestedRows[index];
    const existingName = ingredientNames.get(row.ingredient_id);
    if (
      !existingName ||
      existingName.normalize('NFKC').trim().toLocaleLowerCase() !==
        requested.ingredient_name.normalize('NFKC').trim().toLocaleLowerCase() ||
      row.id !== requested.recipe_ingredient_id ||
      row.ingredient_set_id !== requested.ingredient_set_id ||
      row.position !== requested.position ||
      row.is_main !== requested.is_main ||
      row.detail !== requested.detail ||
      row.preparation !== requested.preparation ||
      !sameNumericValue(row.portion_one_ratio, requested.portion_one_ratio) ||
      !sameNumericValue(row.size_value, requested.size_value) ||
      row.size_unit !== requested.size_unit
    ) {
      return false;
    }

    const currentMeasurements = measurementsByIngredientId.get(row.id) ?? [];
    const requestedMeasurements = requested.measurements ?? [];
    return (
      currentMeasurements.length === requestedMeasurements.length &&
      currentMeasurements.every((measurement, measurementIndex) => {
        const expected = requestedMeasurements[measurementIndex];
        return (
          measurement.position === measurementIndex &&
          measurement.measurement_type === expected.measurement_type &&
          sameNumericValue(measurement.amount_min, expected.amount_min) &&
          sameNumericValue(measurement.amount_max, expected.amount_max) &&
          measurement.unit_code === expected.unit_code &&
          measurement.picklist_value_id === expected.picklist_value_id
        );
      })
    );
  });
}

function imageSvg(recipe, photo) {
  const hash = (value) => createHash('sha256').update(value).digest().readUInt32BE(0);
  const palettes = [
    ['#e9d8b8', '#b86c42', '#687b47', '#f0b84e'],
    ['#dce5d4', '#8d513d', '#52715a', '#e8b54c'],
    ['#f1d5c9', '#ca7653', '#63806b', '#e7ba69'],
    ['#d9e2e8', '#ac704f', '#627e89', '#e0bd6e'],
  ];
  const palette = palettes[hash(`${recipe.slug}:${photo.key}:palette`) % palettes.length];
  const width = photo.kind === 'gallery' ? 1024 : 800;
  const height =
    photo.kind === 'gallery'
      ? 768
      : [560, 600, 640, 680][hash(`${recipe.slug}:${photo.key}:height`) % 4];
  const foods = Array.from({ length: 14 }, (_, index) => {
    const seed = hash(`${recipe.slug}:${photo.key}:food:${index}`);
    const x = 320 + (seed % 390);
    const y = 235 + ((seed >>> 8) % 280);
    const rx = 24 + ((seed >>> 16) % 31);
    const ry = 17 + ((seed >>> 21) % 22);
    const color = palette[1 + ((seed >>> 25) % 3)];
    const rotate = (seed % 60) - 30;
    return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${color}" transform="rotate(${rotate} ${x} ${y})"/>`;
  }).join('');
  const herbs = Array.from({ length: 12 }, (_, index) => {
    const seed = hash(`${recipe.slug}:${photo.key}:herb:${index}`);
    const x = 365 + (seed % 280);
    const y = 270 + ((seed >>> 8) % 220);
    const rotate = seed % 180;
    return `<ellipse cx="${x}" cy="${y}" rx="7" ry="18" fill="#496b43" transform="rotate(${rotate} ${x} ${y})"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1024 768"><rect width="1024" height="768" fill="${palette[0]}"/><path d="M0 610 Q300 530 560 625 T1024 600 V768 H0Z" fill="#ffffff" opacity=".22"/><ellipse cx="512" cy="422" rx="365" ry="285" fill="#ffffff" opacity=".52"/><ellipse cx="512" cy="422" rx="320" ry="242" fill="#f8f5ed"/><ellipse cx="512" cy="422" rx="282" ry="205" fill="${palette[0]}" opacity=".55"/>${foods}${herbs}<circle cx="512" cy="422" r="198" fill="none" stroke="#ffffff" stroke-width="8" opacity=".7"/><path d="M85 150h170M790 630h150" stroke="${palette[2]}" stroke-width="12" stroke-linecap="round" opacity=".45"/></svg>`;
}

async function makeImageBuffers(recipe, photo) {
  const width = photo.kind === 'gallery' ? 1024 : 800;
  const height =
    photo.kind === 'gallery'
      ? 768
      : [560, 600, 640, 680][
          createHash('sha256')
            .update(`${recipe.slug}:${photo.key}:height`)
            .digest()
            .readUInt32BE(0) % 4
        ];
  const full = await sharp(Buffer.from(imageSvg(recipe, photo)))
    .webp({ quality: 86 })
    .toBuffer();
  const thumbnail = await sharp(full)
    .resize({ width: 320, height: 320, fit: 'inside' })
    .webp({ quality: 80 })
    .toBuffer();
  return { full, thumbnail, width, height };
}

function storageObjectPath(accountId, assetId, filename) {
  return `/storage/v1/object/recipe-media/${accountId}/assets/${assetId}/${filename}`;
}

async function uploadStorageObject(apiUrl, headers, objectPath, bytes) {
  const response = await fetch(new URL(objectPath, apiUrl), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'image/webp', 'x-upsert': 'false' },
    body: bytes,
  });
  if (!response.ok) throw new Error(`Local Storage upload failed with HTTP ${response.status}.`);
}

async function removeStorageObject(apiUrl, headers, objectPath) {
  const response = await fetch(new URL(objectPath, apiUrl), { method: 'DELETE', headers });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Local Storage cleanup failed with HTTP ${response.status}.`);
  }
}

async function createMediaAsset(api, recipe, photo, recipeId, accountId) {
  const assetId = await api.rpc('reserve_media_upload', {
    p_parent_type: 'recipe',
    p_parent_id: recipeId,
  });
  if (typeof assetId !== 'string') throw new Error('Local media reservation returned no asset ID.');

  const fullPath = storageObjectPath(accountId, assetId, 'full.webp');
  const thumbnailPath = storageObjectPath(accountId, assetId, 'thumb.webp');
  const uploaded = [];
  try {
    const image = await makeImageBuffers(recipe, photo);
    await uploadStorageObject(api.url, api.serviceHeaders, fullPath, image.full);
    uploaded.push(fullPath);
    await uploadStorageObject(api.url, api.serviceHeaders, thumbnailPath, image.thumbnail);
    uploaded.push(thumbnailPath);
    await api.rpc(
      'complete_media_upload',
      {
        p_asset_id: assetId,
        p_width: image.width,
        p_height: image.height,
        p_byte_size: image.full.byteLength + image.thumbnail.byteLength,
        p_description: photo.description,
      },
      'service',
    );
  } catch (error) {
    const cleanupErrors = [];
    for (const objectPath of uploaded) {
      try {
        await removeStorageObject(api.url, api.serviceHeaders, objectPath);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    try {
      await api.rpc(
        'discard_pending_media_upload',
        { p_asset_id: assetId, p_account_id: accountId },
        'service',
      );
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    if (cleanupErrors.length) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Media upload failed and cleanup was incomplete.',
      );
    }
    throw error;
  }

  return {
    id: assetId,
    description: photo.description,
    position: photo.position,
    is_primary: photo.kind === 'gallery' && photo.position === 0,
    crop: null,
  };
}

function formatApiFilters(filters) {
  return Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, String(value)]));
}

async function listLocalUsers(api) {
  const result = await api.request('/auth/v1/admin/users?page=1&per_page=1000', {
    headers: api.serviceHeaders,
  });
  if (!Array.isArray(result?.users)) {
    throw new Error('Local Auth did not return its user list.');
  }
  return result.users;
}

async function createLocalTestUser(api, email) {
  const user = await api.request('/auth/v1/admin/users', {
    headers: api.serviceHeaders,
    method: 'POST',
    body: { email, password: LOCAL_TEST_PASSWORD, email_confirm: true },
  });
  if (!user?.id || user.email?.toLocaleLowerCase() !== email.toLocaleLowerCase()) {
    throw new Error('Local Auth did not create the expected synthetic test account.');
  }
  return user;
}

async function ensureLocalTestUser(api, users, email) {
  const existing = users.find(
    (user) => user.email?.toLocaleLowerCase() === email.toLocaleLowerCase(),
  );
  if (existing) return { user: existing, created: false };
  const user = await createLocalTestUser(api, email);
  users.push(user);
  return { user, created: true };
}

async function ensureLocalAdmin(api, user) {
  const [account] = await api.table('accounts', {
    select: 'id,is_admin,is_owner',
    id: `eq.${user.id}`,
  });
  if (!account || account.is_owner) {
    throw new Error('The synthetic admin account is unavailable or is an owner.');
  }
  if (account.is_admin) return false;

  const updated = await api.request(tablePath('accounts', { id: `eq.${user.id}` }), {
    headers: api.serviceHeaders,
    method: 'PATCH',
    body: { is_admin: true },
    extraHeaders: { Prefer: 'return=representation' },
  });
  if (
    !Array.isArray(updated) ||
    updated.length !== 1 ||
    updated[0].id !== user.id ||
    !updated[0].is_admin ||
    updated[0].is_owner
  ) {
    throw new Error('The local synthetic admin role could not be verified.');
  }
  return true;
}

function validateRecipeIngredients(recipe) {
  if (recipe.ingredientSets !== undefined && !Array.isArray(recipe.ingredientSets)) {
    throw new Error(`The ingredient sections are invalid for ${recipe.slug}.`);
  }
  const ingredientSets = recipe.ingredientSets ?? [{ key: 'ingredients', label: 'Ingredients' }];
  if (ingredientSets.length === 0) {
    throw new Error(`The recipe has no ingredient sections: ${recipe.slug}.`);
  }

  const setKeys = new Set();
  const setLabels = new Set();
  for (const set of ingredientSets) {
    const key = typeof set.key === 'string' ? set.key.trim() : '';
    const label = typeof set.label === 'string' ? set.label.trim() : '';
    const normalizedLabel = label.normalize('NFKC').toLocaleLowerCase();
    if (!key || !label || label.length > 80 || setKeys.has(key) || setLabels.has(normalizedLabel)) {
      throw new Error(`The ingredient sections are invalid for ${recipe.slug}.`);
    }
    setKeys.add(key);
    setLabels.add(normalizedLabel);
  }

  const ingredientKeys = new Set();
  const ingredientsByKey = new Map();
  const ingredientNamesBySet = new Set();
  for (const ingredient of recipe.ingredients) {
    const key = ingredient.key;
    const name = typeof ingredient.name === 'string' ? ingredient.name.trim() : '';
    const setKey = ingredient.setKey ?? ingredientSets[0].key;
    const normalizedName = name.normalize('NFKC').toLocaleLowerCase();
    const identity = `${setKey}:${normalizedName}`;
    const ratio = ingredient.portionOneRatio;
    const amount = Number(ingredient.amount);
    const hasSizeValue = ingredient.sizeValue !== undefined && ingredient.sizeValue !== null;
    const hasSizeUnit = ingredient.sizeUnit !== undefined && ingredient.sizeUnit !== null;
    if (
      typeof key !== 'string' ||
      !key ||
      ingredientKeys.has(key) ||
      !name ||
      !setKeys.has(setKey) ||
      ingredientNamesBySet.has(identity) ||
      (ratio !== undefined &&
        ratio !== null &&
        (!Number.isFinite(ratio) ||
          ratio <= 0 ||
          ratio >= 1 ||
          !Number.isFinite(amount) ||
          amount <= 0)) ||
      hasSizeValue !== hasSizeUnit ||
      (hasSizeValue &&
        (!Number.isFinite(ingredient.sizeValue) ||
          ingredient.sizeValue <= 0 ||
          !['in', 'cm'].includes(ingredient.sizeUnit) ||
          ingredient.preparation?.toLocaleLowerCase() !== 'cubed'))
    ) {
      throw new Error(`The ingredient data is invalid for ${recipe.slug}.`);
    }
    ingredientKeys.add(key);
    ingredientsByKey.set(key, ingredient);
    ingredientNamesBySet.add(identity);
  }

  for (const step of recipe.instructionDetails) {
    if (!Array.isArray(step.ingredientRefs)) {
      throw new Error(`The ingredient references are invalid for ${recipe.slug}.`);
    }
    for (const reference of step.ingredientRefs) {
      const key = typeof reference === 'string' ? reference : reference?.key;
      const ingredient = ingredientsByKey.get(key);
      const portionOrdinal =
        typeof reference === 'string' ? null : (reference?.portionOrdinal ?? null);
      if (
        !ingredient ||
        (portionOrdinal !== null &&
          (![1, 2].includes(portionOrdinal) ||
            ingredient.portionOneRatio === undefined ||
            ingredient.portionOneRatio === null))
      ) {
        throw new Error(`The ingredient references are invalid for ${recipe.slug}.`);
      }
    }
  }
}

function validateFixture(fixture) {
  if (
    fixture.format !== 'recipe-box-synthetic-site-sample/v6' ||
    !Array.isArray(fixture.publications) ||
    fixture.publications.length === 0 ||
    !fixture.testAccounts ||
    !['primaryOwner', 'admin', 'neighbor', 'empty'].every(
      (role) =>
        typeof fixture.testAccounts[role] === 'string' &&
        fixture.testAccounts[role].toLocaleLowerCase().endsWith(testEmailSuffix),
    ) ||
    new Set([
      fixture.testAccounts.primaryOwner,
      fixture.testAccounts.admin,
      fixture.testAccounts.neighbor,
      fixture.testAccounts.empty,
    ]).size !== 4 ||
    !Array.isArray(fixture.testAccounts.neighborRecipeStates) ||
    fixture.testAccounts.neighborRecipeStates.length !== 3 ||
    new Set(fixture.testAccounts.neighborRecipeStates).size !== 3 ||
    !fixture.testAccounts.neighborRecipeStates.every((state) =>
      ['tried', 'want_to_try', 'will_not_try'].includes(state),
    )
  ) {
    throw new Error('The synthetic fixture format is invalid.');
  }
  for (const publication of fixture.publications) {
    if (new URL(publication.siteUrl).hostname.split('.').at(-1) !== 'test') {
      throw new Error('The synthetic fixture contains a non-test publication URL.');
    }
    for (const recipe of publication.recipes) {
      if (
        !Array.isArray(recipe.ingredients) ||
        !Array.isArray(recipe.instructions) ||
        recipe.instructionDetails?.length !== recipe.instructions.length ||
        !Array.isArray(recipe.photos) ||
        !['tried', 'want_to_try', 'will_not_try'].includes(recipe.state)
      ) {
        throw new Error(`The synthetic fixture is incomplete for ${recipe.slug}.`);
      }
      validateRecipeIngredients(recipe);
      for (const photo of recipe.photos) {
        if (photo.crop.left + photo.crop.width > 1 || photo.crop.top + photo.crop.height > 1) {
          throw new Error(`The synthetic photo crop is invalid for ${recipe.slug}.`);
        }
      }
    }
  }
}

async function getPicklistMap(api, accountId) {
  const rows = await api.table('recipe_picklist_values', {
    select: 'id,category,display_value',
    account_id: `eq.${accountId}`,
  });
  return new Map(rows.map((row) => [`${row.category}:${row.display_value}`, row.id]));
}

async function findOrCreatePublication(api, accountId, publication) {
  const existing = await api.table(
    'publications',
    formatApiFilters({
      select: 'id,name,publication_type,site_url,trashed_at',
      account_id: `eq.${accountId}`,
      publication_type: 'eq.site',
      site_url: `eq.${publication.siteUrl}`,
    }),
  );
  if (existing.length > 1) throw new Error('The local synthetic publication URL is ambiguous.');
  if (existing.length === 1) {
    if (existing[0].name !== publication.name || existing[0].trashed_at) {
      throw new Error('A matching local publication exists but is not available for this fixture.');
    }
    return { id: existing[0].id, created: false };
  }
  const id = await api.rpc('create_publication', {
    p_name: publication.name,
    p_publication_type: 'site',
    p_author: null,
    p_edition: null,
    p_isbn: null,
    p_retailer_url: null,
    p_issue: null,
    p_site_url: publication.siteUrl,
    p_tag_ids: [],
  });
  if (typeof id !== 'string') throw new Error('Local publication creation returned no ID.');
  return { id, created: true };
}

async function seedRecipe(api, accountId, publicationId, publication, recipe, picklists) {
  const recipeUrl = new URL(`/recipes/${recipe.slug}`, publication.siteUrl).toString();
  const existing = await api.table(
    'recipes',
    formatApiFilters({
      select: 'id,version',
      account_id: `eq.${accountId}`,
      publication_id: `eq.${publicationId}`,
      recipe_url: `eq.${recipeUrl}`,
    }),
  );
  if (existing.length > 1) throw new Error(`The local recipe URL is ambiguous for ${recipe.slug}.`);
  let recipeId;
  let recipeVersion;
  let created = false;

  if (existing.length === 0) {
    const initialPayload = recipePayload(
      recipe,
      publicationId,
      recipeUrl,
      accountId,
      picklists,
      null,
      null,
      [],
    );
    const [saved] = await api.rpc('save_recipe_with_ingredient_sets', initialPayload);
    if (!saved?.id || !Number.isSafeInteger(saved.version)) {
      throw new Error(`Local recipe creation returned no version for ${recipe.slug}.`);
    }
    recipeId = saved.id;
    recipeVersion = saved.version;
    created = true;
  } else {
    recipeId = existing[0].id;
    recipeVersion = existing[0].version;
  }

  const mediaRows = await api.table(
    'media_assets',
    formatApiFilters({
      select: 'id,description,position,is_primary,crop',
      account_id: `eq.${accountId}`,
      recipe_id: `eq.${recipeId}`,
      status: 'eq.ready',
      asset_type: 'eq.recipe_photo',
    }),
  );
  const photosByDescription = new Map(mediaRows.map((asset) => [asset.description, asset]));
  const photoIds = new Map();
  let uploadedPhotos = 0;
  let reusedPhotos = 0;

  for (const photo of recipe.photos) {
    let asset = photosByDescription.get(photo.description);
    if (asset) {
      reusedPhotos += 1;
    } else {
      asset = await createMediaAsset(api, recipe, photo, recipeId, accountId);
      photosByDescription.set(photo.description, asset);
      uploadedPhotos += 1;
    }
    if (
      asset.crop?.left !== photo.crop.left ||
      asset.crop?.top !== photo.crop.top ||
      asset.crop?.width !== photo.crop.width ||
      asset.crop?.height !== photo.crop.height ||
      asset.crop?.rotation !== photo.crop.rotation
    ) {
      const [framed] = await api.rpc('update_media_crop', {
        p_asset_id: asset.id,
        p_expected_version: recipeVersion,
        p_crop: photo.crop,
      });
      if (!Number.isSafeInteger(framed?.version)) {
        throw new Error(`Local photo framing returned no recipe version for ${recipe.slug}.`);
      }
      recipeVersion = framed.version;
      asset.crop = photo.crop;
    }
    if (asset.position !== photo.position) {
      await api.request(tablePath('media_assets', { id: `eq.${asset.id}` }), {
        headers: api.serviceHeaders,
        method: 'PATCH',
        body: { position: photo.position },
        extraHeaders: { Prefer: 'return=minimal' },
      });
      asset.position = photo.position;
    }
    if (photo.kind === 'gallery' && !asset.is_primary) {
      await api.rpc('set_recipe_photo_primary', { p_asset_id: asset.id });
      asset.is_primary = true;
    }
    photoIds.set(photo.key, asset.id);
  }

  const steps = makeInstructionSteps(recipe, accountId, recipeUrl, photoIds);
  const currentSteps = await api.table(
    'recipe_steps',
    formatApiFilters({
      select: 'position,content_markdown,plain_text',
      recipe_id: `eq.${recipeId}`,
      order: 'position.asc',
    }),
  );
  let updated = false;
  const payload = recipePayload(
    recipe,
    publicationId,
    recipeUrl,
    accountId,
    picklists,
    recipeId,
    recipeVersion,
    steps,
  );
  if (
    !sameSteps(currentSteps, steps) ||
    !(await sameIngredientData(
      api,
      accountId,
      recipeId,
      payload.p_ingredient_rows,
      payload.p_ingredient_sets,
    ))
  ) {
    const [saved] = await api.rpc('save_recipe_with_ingredient_sets', payload);
    if (!saved?.id || !Number.isSafeInteger(saved.version)) {
      throw new Error(`Local recipe update returned no version for ${recipe.slug}.`);
    }
    recipeVersion = saved.version;
    updated = true;
  }

  return { created, updated, uploadedPhotos, reusedPhotos };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: npm run seed:synthetic -- --local [--dry-run]');
    return;
  }

  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  validateFixture(fixture);
  const environment = readLocalEnvironment();
  const api = {
    url: environment.apiUrl,
    serviceHeaders: headersFor(environment.serviceRoleKey),
    ownerHeaders: null,
    request(pathname, options) {
      return requestJson(environment.apiUrl, pathname, options);
    },
    async rpc(name, body, identity = 'owner') {
      const headers = identity === 'service' ? this.serviceHeaders : this.ownerHeaders;
      return this.request(rpcPath(name), { headers, method: 'POST', body });
    },
    table(table, filters) {
      return this.request(tablePath(table, filters), { headers: this.serviceHeaders });
    },
  };
  const users = await listLocalUsers(api);
  let owner = findLocalOwner(users, fixture.testAccounts.primaryOwner);
  let picklists = null;
  if (owner) {
    api.ownerHeaders = headersFor(
      environment.anonKey,
      createOwnerToken(owner.id, environment.jwtSecret),
    );
    picklists = await getPicklistMap(api, owner.id);
  }
  const recipeCount = fixture.publications.reduce(
    (count, publication) => count + publication.recipes.length,
    0,
  );
  const photoCount = fixture.publications.reduce(
    (count, publication) =>
      count +
      publication.recipes.reduce((recipeTotal, recipe) => recipeTotal + recipe.photos.length, 0),
    0,
  );

  if (options.dryRun) {
    console.log(
      JSON.stringify({
        target: 'local loopback Supabase',
        publications: fixture.publications.length,
        recipes: recipeCount,
        generatedPhotos: photoCount,
        picklistsValidated: picklists !== null,
        primaryOwnerBootstrapRequired: owner === null,
        writes: 0,
      }),
    );
    return;
  }

  let ownerCreated = false;
  if (!owner) {
    const createdOwner = await createLocalTestUser(api, fixture.testAccounts.primaryOwner);
    users.push(createdOwner);
    owner = createdOwner;
    ownerCreated = true;
  }
  const neighborAccount = await ensureLocalTestUser(api, users, fixture.testAccounts.neighbor);
  const emptyAccount = await ensureLocalTestUser(api, users, fixture.testAccounts.empty);
  const adminAccount = await ensureLocalTestUser(api, users, fixture.testAccounts.admin);
  const adminRoleGranted = await ensureLocalAdmin(api, adminAccount.user);
  const accountId = owner.id;
  api.ownerHeaders = headersFor(
    environment.anonKey,
    createOwnerToken(accountId, environment.jwtSecret),
  );
  picklists = await getPicklistMap(api, accountId);

  const totals = {
    publicationsCreated: 0,
    recipesCreated: 0,
    recipesUpdated: 0,
    recipesUnchanged: 0,
    photosUploaded: 0,
    photosReused: 0,
  };

  for (const publication of fixture.publications) {
    const savedPublication = await findOrCreatePublication(api, accountId, publication);
    if (savedPublication.created) totals.publicationsCreated += 1;
    for (const recipe of publication.recipes) {
      const result = await seedRecipe(
        api,
        accountId,
        savedPublication.id,
        publication,
        recipe,
        picklists,
      );
      if (result.created) totals.recipesCreated += 1;
      else if (result.updated) totals.recipesUpdated += 1;
      else totals.recipesUnchanged += 1;
      totals.photosUploaded += result.uploadedPhotos;
      totals.photosReused += result.reusedPhotos;
    }
  }

  api.ownerHeaders = headersFor(
    environment.anonKey,
    createOwnerToken(neighborAccount.user.id, environment.jwtSecret),
  );
  const neighborPicklists = await getPicklistMap(api, neighborAccount.user.id);
  const allRecipes = fixture.publications.flatMap((publication) =>
    publication.recipes.map((recipe) => ({ publication, recipe })),
  );
  const neighborRecipes = fixture.testAccounts.neighborRecipeStates.map((state) => {
    const selection = allRecipes.find(({ recipe }) => recipe.state === state);
    if (!selection) {
      throw new Error(`No fixture recipe is available for neighbor state "${state}".`);
    }
    return selection;
  });
  const neighborTotals = {
    publicationsCreated: 0,
    recipesCreated: 0,
    recipesUpdated: 0,
    recipesUnchanged: 0,
    photosUploaded: 0,
    photosReused: 0,
  };
  for (const { publication, recipe } of neighborRecipes) {
    const savedPublication = await findOrCreatePublication(
      api,
      neighborAccount.user.id,
      publication,
    );
    if (savedPublication.created) neighborTotals.publicationsCreated += 1;
    const result = await seedRecipe(
      api,
      neighborAccount.user.id,
      savedPublication.id,
      publication,
      recipe,
      neighborPicklists,
    );
    if (result.created) neighborTotals.recipesCreated += 1;
    else if (result.updated) neighborTotals.recipesUpdated += 1;
    else neighborTotals.recipesUnchanged += 1;
    neighborTotals.photosUploaded += result.uploadedPhotos;
    neighborTotals.photosReused += result.reusedPhotos;
  }

  console.log(
    JSON.stringify({
      target: 'local loopback Supabase',
      primaryOwner:
        owner.email?.toLocaleLowerCase() === fixture.testAccounts.primaryOwner
          ? 'synthetic-fixture-account'
          : 'existing-local-account',
      syntheticAccountsCreated: [
        ownerCreated,
        neighborAccount.created,
        emptyAccount.created,
        adminAccount.created,
      ].filter(Boolean).length,
      syntheticAdminReady: true,
      syntheticAdminRoleGranted: adminRoleGranted,
      ...totals,
      totalRecipes: recipeCount,
      expectedPhotos: photoCount,
      neighborRecipesCreated: neighborTotals.recipesCreated,
      neighborPublicationsCreated: neighborTotals.publicationsCreated,
      neighborRecipesUpdated: neighborTotals.recipesUpdated,
      neighborRecipesUnchanged: neighborTotals.recipesUnchanged,
      neighborPhotosUploaded: neighborTotals.photosUploaded,
      neighborPhotosReused: neighborTotals.photosReused,
      emptyAccountRecipes: 0,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Synthetic local seed failed.');
  process.exitCode = 1;
});
