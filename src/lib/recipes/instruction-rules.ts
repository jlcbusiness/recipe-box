export type InstructionStepDraft = {
  id: string;
  markdown: string;
  plainText: string;
};

export type InstructionMention = {
  recipeIngredientId: string;
  slug: string;
  portionOrdinal: 1 | 2 | null;
};

export type IngredientMentionOptionInput = {
  id: string;
  ingredientId: string;
  name: string;
  setId: string;
  setLabel: string;
  portionAmounts?: readonly [string, string];
};

export type IngredientMentionOption = {
  recipeIngredientId: string;
  ingredientSetId: string;
  portionOrdinal: 1 | 2 | null;
  label: string;
  slug: string;
};

export type InstructionStepPayload = {
  id: string;
  position: number;
  content_markdown: string;
  plain_text: string;
};

const mentionPattern =
  /\[\[ingredient:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?::([12]))?\|([^\]\r\n]+)\]\]/giu;
const mentionPrefixPattern = /\[\[ingredient:/giu;
const durationPattern = /\[\[duration:([^\]\r\n]+)\]\]/giu;
const durationDelimiterPattern = /(?<![\\=])=([^\s=\r\n](?:[^=\r\n]*[^\s=\r\n])?)(?<!\\)=(?![=])/gu;
const temperaturePattern = /(?<![\p{L}\p{N}_])([FC])!(\d+(?:\.\d+)?)\b/giu;
const stoveHeatLabelPattern =
  /(?<![\p{L}\p{N}_])!([\p{L}\p{M}](?:[\p{L}\p{M} -]*[\p{L}\p{M}])?)!(?![\p{L}\p{N}_])/giu;
const photoPattern =
  /\[\[photo:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\]\]((?:-(?:left|center|steponly|nowrap|w?[1-9]\d{0,3})){0,5})/giu;
const photoPrefixPattern = /\[\[photo:/giu;
const readablePhotoPattern =
  /(?<![\p{L}\p{N}_])\+photo(\d{2})((?:-(?:left|center|steponly|nowrap|w[1-9]\d{0,3})){0,5})(?![\p{N}_-])/u;

export type InstructionPhotoModifiers = {
  alignment: 'left' | 'right' | 'center';
  width?: number;
  stepOnly?: boolean;
  noWrap?: boolean;
};

export function parseInstructionPhotoModifiers(suffix: string): InstructionPhotoModifiers | null {
  const parts = suffix ? suffix.slice(1).split('-') : [];
  if (parts.some((part) => !part)) {
    return null;
  }

  let alignment: InstructionPhotoModifiers['alignment'] = 'right';
  let hasAlignment = false;
  let width: number | undefined;
  let stepOnly = false;
  let noWrap = false;
  for (const part of parts) {
    if (part === 'left' || part === 'center') {
      if (hasAlignment) return null;
      alignment = part;
      hasAlignment = true;
      continue;
    }

    if (part === 'steponly' && !stepOnly) {
      stepOnly = true;
      continue;
    }

    if (part === 'nowrap' && !noWrap) {
      noWrap = true;
      continue;
    }

    const widthText = part.startsWith('w') ? part.slice(1) : part;
    if (!/^[1-9]\d{0,3}$/u.test(widthText) || width !== undefined) {
      return null;
    }
    width = Number(widthText);
  }

  if (stepOnly && noWrap) {
    return null;
  }

  return {
    alignment,
    ...(width === undefined ? {} : { width }),
    ...(stepOnly ? { stepOnly } : {}),
    ...(noWrap ? { noWrap } : {}),
  };
}

function instructionPhotoModifierSuffix(modifiers: InstructionPhotoModifiers): string {
  return `${modifiers.alignment === 'right' ? '' : `-${modifiers.alignment}`}${modifiers.width ? `-w${modifiers.width}` : ''}${modifiers.stepOnly ? '-steponly' : ''}${modifiers.noWrap ? '-nowrap' : ''}`;
}

function instructionPhotoMarker(id: string, modifiers: InstructionPhotoModifiers): string {
  return `[[photo:${id}]]${instructionPhotoModifierSuffix(modifiers)}`;
}

export function ingredientSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

export function ingredientMentionMarker(mention: {
  recipeIngredientId: string;
  portionOrdinal: 1 | 2 | null;
  slug: string;
}): string {
  const portion = mention.portionOrdinal === null ? '' : `:${mention.portionOrdinal}`;
  return `[[ingredient:${mention.recipeIngredientId}${portion}|${mention.slug}]]`;
}

export function getIngredientMentionReplacementEnd(
  editorValue: string,
  start: number,
  end: number,
  candidateSlug: string,
): number {
  let replacementEnd = end;
  let matchedSlug = ingredientSlug(editorValue.slice(start + 1, replacementEnd));
  while (matchedSlug && candidateSlug.startsWith(`${matchedSlug}-`)) {
    const nextWord = /^(\s+[\p{L}\p{N}-]+)/u.exec(editorValue.slice(replacementEnd));
    if (!nextWord) {
      break;
    }
    const nextSlug = ingredientSlug(
      `${editorValue.slice(start + 1, replacementEnd)}${nextWord[0]}`,
    );
    if (nextSlug !== candidateSlug && !candidateSlug.startsWith(`${nextSlug}-`)) {
      break;
    }
    replacementEnd += nextWord[0].length;
    matchedSlug = nextSlug;
  }
  return replacementEnd;
}

function resolveTypedIngredientMention(
  slug: string,
  mentionOptions: readonly IngredientMentionOption[],
): IngredientMentionOption | undefined {
  const normalizedSlug = slug.toLocaleLowerCase();
  const exactMatch = mentionOptions.find(
    (mention) => mention.slug.toLocaleLowerCase() === normalizedSlug,
  );
  if (exactMatch) {
    return exactMatch;
  }

  const portionMatch = /^(.*)-([12])$/u.exec(normalizedSlug);
  if (!portionMatch) {
    return undefined;
  }
  const ingredientPrefix = `${portionMatch[1]}-`;
  const portionOrdinal = Number(portionMatch[2]);
  const candidates = mentionOptions.filter(
    (mention) =>
      mention.portionOrdinal === portionOrdinal &&
      mention.slug.toLocaleLowerCase().startsWith(ingredientPrefix),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

type InstructionEditorMarker = {
  kind: 'mention' | 'duration' | 'temperature' | 'photo';
  sourceStart: number;
  sourceEnd: number;
  displayStart: number;
  displayEnd: number;
  displayText: string;
  marker: string;
};

export type InstructionPhotoOption = { id: string; reference_code: number | null };

function getInstructionEditorMarkers(
  markdown: string,
  photos: readonly InstructionPhotoOption[] = [],
): InstructionEditorMarker[] {
  const markers: Array<Omit<InstructionEditorMarker, 'displayStart' | 'displayEnd'>> = [];
  for (const match of markdown.matchAll(new RegExp(mentionPattern))) {
    const rawSlug = match[3] ?? '';
    const legacyPortion = /^([12])\|(.+)$/u.exec(rawSlug);
    const slug = legacyPortion?.[2] ?? rawSlug;
    const portionOrdinal = match[2]
      ? (Number(match[2]) as 1 | 2)
      : legacyPortion
        ? (Number(legacyPortion[1]) as 1 | 2)
        : null;
    markers.push({
      kind: 'mention',
      sourceStart: match.index ?? 0,
      sourceEnd: (match.index ?? 0) + match[0].length,
      displayText: `#${slug}`,
      marker: ingredientMentionMarker({
        recipeIngredientId: (match[1] ?? '').toLocaleLowerCase(),
        portionOrdinal,
        slug,
      }),
    });
  }
  for (const match of markdown.matchAll(new RegExp(durationPattern))) {
    markers.push({
      kind: 'duration',
      sourceStart: match.index ?? 0,
      sourceEnd: (match.index ?? 0) + match[0].length,
      displayText: match[1] ?? '',
      marker: match[0],
    });
  }
  for (const match of markdown.matchAll(new RegExp(temperaturePattern))) {
    markers.push({
      kind: 'temperature',
      sourceStart: match.index ?? 0,
      sourceEnd: (match.index ?? 0) + match[0].length,
      displayText: match[0],
      marker: match[0],
    });
  }
  for (const match of markdown.matchAll(new RegExp(photoPattern))) {
    const photo = photos.find(
      (candidate) => candidate.id.toLocaleLowerCase() === (match[1] ?? '').toLocaleLowerCase(),
    );
    const modifiers = parseInstructionPhotoModifiers(match[2] ?? '') ?? {
      alignment: 'right' as const,
    };
    markers.push({
      kind: 'photo',
      sourceStart: match.index ?? 0,
      sourceEnd: (match.index ?? 0) + match[0].length,
      displayText: photo
        ? `+photo${String(photo.reference_code ?? 0).padStart(2, '0')}${instructionPhotoModifierSuffix(modifiers)}`
        : '[Photo]',
      marker: match[0],
    });
  }

  markers.sort((left, right) => left.sourceStart - right.sourceStart);
  let offsetChange = 0;
  return markers.map((marker) => {
    const displayStart = marker.sourceStart + offsetChange;
    const displayEnd = displayStart + marker.displayText.length;
    offsetChange += marker.displayText.length - (marker.sourceEnd - marker.sourceStart);
    return { ...marker, displayStart, displayEnd };
  });
}

export function getInstructionEditorValue(
  markdown: string,
  photos: readonly InstructionPhotoOption[] = [],
): string {
  return getInstructionEditorMarkers(markdown, photos)
    .sort((left, right) => right.sourceStart - left.sourceStart)
    .reduce(
      (value, marker) =>
        `${value.slice(0, marker.sourceStart)}${marker.displayText}${value.slice(marker.sourceEnd)}`,
      markdown,
    );
}

export function updateInstructionMarkdownFromEditor(
  previousMarkdown: string,
  editorValue: string,
  photos: readonly InstructionPhotoOption[] = [],
  mentionOptions: readonly IngredientMentionOption[] = [],
): string {
  const previousValue = getInstructionEditorValue(previousMarkdown, photos);
  if (previousValue === editorValue) {
    return previousMarkdown;
  }

  let changedStart = 0;
  while (
    changedStart < previousValue.length &&
    changedStart < editorValue.length &&
    previousValue[changedStart] === editorValue[changedStart]
  ) {
    changedStart += 1;
  }

  let unchangedSuffix = 0;
  while (
    unchangedSuffix < previousValue.length - changedStart &&
    unchangedSuffix < editorValue.length - changedStart &&
    previousValue[previousValue.length - unchangedSuffix - 1] ===
      editorValue[editorValue.length - unchangedSuffix - 1]
  ) {
    unchangedSuffix += 1;
  }

  const changedEnd = previousValue.length - unchangedSuffix;
  const offsetChange = editorValue.length - previousValue.length;
  const replacements = getInstructionEditorMarkers(previousMarkdown, photos).flatMap((marker) => {
    const isBeforeChange = marker.displayEnd <= changedStart;
    const isAfterChange = marker.displayStart >= changedEnd;
    if (!isBeforeChange && !isAfterChange) {
      if (marker.kind !== 'photo') {
        return [];
      }

      const expectedCode = /^\+photo(\d{2})/u.exec(marker.displayText)?.[1];
      const editedPhoto = readablePhotoPattern.exec(editorValue.slice(marker.displayStart));
      const modifiers = editedPhoto ? parseInstructionPhotoModifiers(editedPhoto[2] ?? '') : null;
      const sourceId = new RegExp(photoPattern).exec(marker.marker)?.[1];
      if (
        !expectedCode ||
        !editedPhoto ||
        editedPhoto[1] !== expectedCode ||
        !modifiers ||
        !sourceId
      ) {
        return [];
      }

      return [
        {
          ...marker,
          displayText: editedPhoto[0],
          marker: instructionPhotoMarker(sourceId, modifiers),
        },
      ];
    }

    const displayStart = marker.displayStart + (isAfterChange ? offsetChange : 0);
    if (
      editorValue.slice(displayStart, displayStart + marker.displayText.length) !==
      marker.displayText
    ) {
      return [];
    }
    return [{ ...marker, displayStart }];
  });

  const updatedMarkdown = replacements
    .sort((left, right) => right.displayStart - left.displayStart)
    .reduce(
      (value, marker) =>
        `${value.slice(0, marker.displayStart)}${marker.marker}${value.slice(
          marker.displayStart + marker.displayText.length,
        )}`,
      editorValue,
    );
  const photoIdsByCode = new Map(
    photos.flatMap((photo) =>
      photo.reference_code === null
        ? []
        : [[String(photo.reference_code).padStart(2, '0'), photo.id] as const],
    ),
  );

  const markdownWithPhotos = updatedMarkdown.replace(
    /(?<![\p{L}\p{N}_])\+photo(\d{2})((?:-(?:left|center|steponly|nowrap|w[1-9]\d{0,3})){0,5})(?![\p{N}_-])/gu,
    (match, code: string, suffix: string) => {
      const photoId = photoIdsByCode.get(code);
      const modifiers = parseInstructionPhotoModifiers(suffix);
      return photoId && modifiers ? instructionPhotoMarker(photoId, modifiers) : match;
    },
  );
  return markdownWithPhotos.replace(
    /(?<![\p{L}\p{N}_#])#([\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*)(?![\p{L}\p{N}_-])/gu,
    (match, slug: string) => {
      const mention = resolveTypedIngredientMention(slug, mentionOptions);
      return mention ? ingredientMentionMarker(mention) : match;
    },
  );
}

export function replaceInstructionEditorRange(
  markdown: string,
  displayStart: number,
  displayEnd: number,
  replacement: string,
  photos: readonly InstructionPhotoOption[] = [],
): string {
  const mentions = getInstructionEditorMarkers(markdown, photos);
  const toSourceOffset = (displayOffset: number, isEnd: boolean) => {
    let sourceCursor = 0;
    let editorCursor = 0;

    for (const mention of mentions) {
      const plainLength = mention.sourceStart - sourceCursor;
      const plainEnd = editorCursor + plainLength;
      if (displayOffset <= plainEnd) {
        return sourceCursor + displayOffset - editorCursor;
      }
      editorCursor = plainEnd;
      sourceCursor = mention.sourceStart;
      if (displayOffset <= mention.displayEnd) {
        return isEnd ? mention.sourceEnd : mention.sourceStart;
      }
      editorCursor = mention.displayEnd;
      sourceCursor = mention.sourceEnd;
    }

    return sourceCursor + displayOffset - editorCursor;
  };

  const sourceStart = toSourceOffset(displayStart, false);
  const sourceEnd = toSourceOffset(displayEnd, true);
  return `${markdown.slice(0, sourceStart)}${replacement}${markdown.slice(sourceEnd)}`;
}

export function buildIngredientMentionOptions(
  rows: readonly IngredientMentionOptionInput[],
): IngredientMentionOption[] {
  const setIdsByIngredient = new Map<string, Set<string>>();
  for (const row of rows) {
    const ingredientId = row.ingredientId.toLocaleLowerCase();
    const setIds = setIdsByIngredient.get(ingredientId) ?? new Set<string>();
    setIds.add(row.setId);
    setIdsByIngredient.set(ingredientId, setIds);
  }

  return rows.flatMap<IngredientMentionOption>((row) => {
    const ingredientAppearsInMultipleSets =
      (setIdsByIngredient.get(row.ingredientId.toLocaleLowerCase())?.size ?? 0) > 1;
    const rowLabel = ingredientAppearsInMultipleSets ? `${row.name} (${row.setLabel})` : row.name;
    const baseSlug = `${ingredientSlug(row.name)}-${ingredientSlug(row.setLabel)}`;
    if (!row.portionAmounts) {
      return [
        {
          recipeIngredientId: row.id,
          ingredientSetId: row.setId,
          portionOrdinal: null,
          label: rowLabel,
          slug: baseSlug,
        },
      ];
    }

    const [firstAmount, secondAmount] = row.portionAmounts;
    const equalAmounts = firstAmount === secondAmount;
    return row.portionAmounts.map((amount, index) => {
      const portionOrdinal = (index + 1) as 1 | 2;
      const portionLabel = equalAmounts
        ? `${portionOrdinal === 1 ? '1st' : '2nd'} ${amount}`
        : amount;
      return {
        recipeIngredientId: row.id,
        ingredientSetId: row.setId,
        portionOrdinal,
        label: `${rowLabel} (${portionLabel})`,
        slug: `${baseSlug}-${portionOrdinal}`,
      };
    });
  });
}

export function instructionPlainText(markdown: string): string {
  return markdown
    .replace(mentionPattern, (_marker, _id: string, _ordinal: string, rawSlug: string) => {
      const legacyPortion = /^([12])\|(.+)$/u.exec(rawSlug);
      return `#${legacyPortion?.[2] ?? rawSlug}`;
    })
    .replace(new RegExp(durationPattern), '$1')
    .replace(new RegExp(durationDelimiterPattern), '$1')
    .replace(new RegExp(stoveHeatLabelPattern), '$1')
    .replace(
      new RegExp(temperaturePattern),
      (_marker, unit: string, value: string) => `${value}°${unit.toLocaleUpperCase()}`,
    )
    .replace(new RegExp(photoPattern), '')
    .replace(/!?\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/(`{1,3})([\s\S]*?)\1/gu, '$2')
    .replace(/(\*\*|__|~~|\*|_)([\s\S]*?)\1/gu, '$2')
    .replace(/^\s{0,3}#{1,6}\s+/gmu, '')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gmu, '')
    .replace(/^\s*>\s?/gmu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function parseInstructionPhotoReferences(markdown: string): string[] {
  const matches = [...markdown.matchAll(new RegExp(photoPattern))];
  const prefixes = markdown.match(photoPrefixPattern) ?? [];
  if (matches.length !== prefixes.length) {
    throw new Error('Instruction contains an invalid photo reference.');
  }
  return matches.map((match) => (match[1] ?? '').toLocaleLowerCase());
}

export function unlinkInstructionPhoto(markdown: string, assetId: string): string {
  const references = parseInstructionPhotoReferences(markdown);
  if (!references.includes(assetId.toLocaleLowerCase())) {
    return markdown;
  }
  const escapedId = assetId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return markdown.replace(
    new RegExp(
      `\\[\\[photo:${escapedId}\\]\\](?:-(?:left|center|steponly|nowrap|w?[1-9]\\d{0,3})){0,5}`,
      'giu',
    ),
    '',
  );
}

export function parseIngredientMentions(markdown: string): InstructionMention[] {
  const matches = [...markdown.matchAll(mentionPattern)];
  const prefixes = markdown.match(mentionPrefixPattern) ?? [];
  if (matches.length !== prefixes.length) {
    throw new Error('Instruction contains an invalid ingredient mention.');
  }

  return matches.map((match) => {
    const rawSlug = match[3] ?? '';
    const legacyPortion = /^([12])\|(.+)$/u.exec(rawSlug);
    return {
      recipeIngredientId: (match[1] ?? '').toLocaleLowerCase(),
      slug: legacyPortion?.[2] ?? rawSlug,
      portionOrdinal: match[2]
        ? (Number(match[2]) as 1 | 2)
        : legacyPortion
          ? (Number(legacyPortion[1]) as 1 | 2)
          : null,
    };
  });
}

export function resolveInstructionMentions(
  markdown: string,
  ingredients: readonly { id: string; name: string }[],
): string {
  const namesById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.name]));
  const mentions = parseIngredientMentions(markdown);
  let mentionIndex = 0;

  return markdown.replace(mentionPattern, () => {
    const mention = mentions[mentionIndex++];
    const name = mention ? namesById.get(mention.recipeIngredientId) : undefined;
    if (!name) {
      throw new Error('Instruction mentions must reference an ingredient row in this recipe.');
    }
    return name;
  });
}

export function unlinkIngredientMentions(
  markdown: string,
  recipeIngredientId: string,
  ingredientName: string,
): string {
  parseIngredientMentions(markdown);
  const escapedId = recipeIngredientId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const targetPattern = new RegExp(`\\[\\[ingredient:${escapedId}\\|[^\\]\\r\\n]+\\]\\]`, 'giu');
  const slug = ingredientSlug(ingredientName);
  if (!slug) {
    throw new Error('Ingredient names must produce a readable mention.');
  }
  return markdown.replace(targetPattern, `#${slug}`);
}

export function serializeInstructionSteps(
  steps: readonly InstructionStepDraft[],
  recipeIngredientIds: readonly string[],
): InstructionStepPayload[] {
  const seenStepIds = new Set<string>();
  const validIngredientIds = new Set(recipeIngredientIds.map((id) => id.toLocaleLowerCase()));
  const payload: InstructionStepPayload[] = [];

  for (const step of steps) {
    if (!step.id || seenStepIds.has(step.id)) {
      throw new Error('Instruction step IDs must be unique.');
    }
    seenStepIds.add(step.id);

    const markdown = step.markdown.trim();
    if (!markdown) {
      continue;
    }

    for (const mention of parseIngredientMentions(markdown)) {
      if (!validIngredientIds.has(mention.recipeIngredientId)) {
        throw new Error('Instruction mentions must reference an ingredient row in this recipe.');
      }
    }

    payload.push({
      id: step.id,
      position: payload.length,
      content_markdown: markdown,
      plain_text: step.plainText.trim(),
    });
  }

  return payload;
}
