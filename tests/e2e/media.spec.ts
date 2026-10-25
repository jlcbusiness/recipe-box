import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { MAX_RECIPE_PHOTOS } from '../../src/lib/media/rules';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

declare global {
  interface Window {
    __recipePhotoDragSamples?: { x: number; y: number }[];
  }
}

function ownerHeaders(anonKey: string, accessToken: string) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  };
}

function serviceHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

function runLocalSql(sql: string) {
  try {
    execFileSync('supabase', ['db', 'query', '--local', '--output-format', 'json', sql], {
      encoding: 'utf8',
    });
  } catch (error) {
    const commandError =
      error instanceof Error
        ? (error as Error & {
            stdout?: unknown;
            stderr?: unknown;
            status?: number | null;
            signal?: string | null;
          })
        : null;
    const stdout = String(commandError?.stdout ?? '').trim();
    const stderr = String(commandError?.stderr ?? '').trim();
    const diagnostic = [
      commandError?.status != null ? `Exit status: ${commandError.status}` : '',
      commandError?.signal ? `Signal: ${commandError.signal}` : '',
      stdout ? `stdout:\n${stdout}` : '',
      stderr ? `stderr:\n${stderr}` : '',
    ]
      .filter(Boolean)
      .join('\n')
      .replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, '$1[redacted]@')
      .replace(/((?:password|token|secret|apikey)=)[^\s&]+/gi, '$1[redacted]');
    throw new Error(diagnostic || 'Local Supabase SQL command failed without diagnostics.', {
      cause: error,
    });
  }
}

async function deleteMediaFixtures(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  serviceRoleKey: string,
  accountId: string,
) {
  const headers = serviceHeaders(serviceRoleKey);
  const assets = await request.delete(`${apiUrl}/rest/v1/media_assets?account_id=eq.${accountId}`, {
    headers,
  });
  expect(assets.ok(), await assets.text()).toBeTruthy();
  const queue = await request.delete(
    `${apiUrl}/rest/v1/media_deletion_queue?account_id=eq.${accountId}`,
    { headers },
  );
  expect(queue.ok(), await queue.text()).toBeTruthy();
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/publications$/);
}

async function createBook(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  headers: Record<string, string>,
  name: string,
) {
  const response = await request.post(`${apiUrl}/rest/v1/rpc/create_publication`, {
    headers,
    data: {
      p_name: name,
      p_publication_type: 'book',
      p_author: null,
      p_edition: null,
      p_isbn: null,
      p_retailer_url: null,
      p_issue: null,
      p_site_url: null,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as string;
}

async function createRecipe(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  headers: Record<string, string>,
  name: string,
  instructionSteps: {
    id: string;
    position: number;
    content_markdown: string;
    plain_text: string;
  }[] = [],
) {
  const response = await request.post(`${apiUrl}/rest/v1/rpc/save_recipe`, {
    headers,
    data: {
      p_recipe_id: null,
      p_expected_version: null,
      p_name: name,
      p_food_type_id: null,
      p_state: 'want_to_try',
      p_verdict_id: null,
      p_enthusiasm_id: null,
      p_occasion_details: null,
      p_reason: null,
      p_serves: null,
      p_prep_time_minutes: null,
      p_mixing_time_minutes: null,
      p_marinate_time_minutes: null,
      p_chill_time_minutes: null,
      p_freeze_time_minutes: null,
      p_cook_time_minutes: null,
      p_bake_time_minutes: null,
      p_cooling_time_minutes: null,
      p_rest_time_minutes: null,
      p_total_time_minutes: null,
      p_notes_markdown: '',
      p_meal_type_ids: [],
      p_cuisine_ids: [],
      p_equipment_ids: [],
      p_ingredient_rows: [],
      p_instruction_steps: instructionSteps,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const [recipe] = (await response.json()) as { id: string; version: number }[];
  return recipe.id;
}

async function createImageBuffer() {
  return sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: { r: 126, g: 154, b: 116 },
    },
  })
    .png()
    .toBuffer();
}

async function createReadyRecipePhoto(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  ownerAuth: Record<string, string>,
  service: Record<string, string>,
  recipeId: string,
) {
  const reservation = await request.post(`${apiUrl}/rest/v1/rpc/reserve_media_upload`, {
    headers: ownerAuth,
    data: { p_parent_type: 'recipe', p_parent_id: recipeId },
  });
  expect(reservation.ok(), await reservation.text()).toBeTruthy();
  const assetId = (await reservation.json()) as string;
  const completion = await request.post(`${apiUrl}/rest/v1/rpc/complete_media_upload`, {
    headers: service,
    data: {
      p_asset_id: assetId,
      p_width: 32,
      p_height: 24,
      p_byte_size: 100,
      p_description: '',
    },
  });
  expect(completion.ok(), await completion.text()).toBeTruthy();
  return assetId;
}

test('a new recipe can upload photos selected before saving @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const recipeName = `Recipe with a draft photo ${randomUUID()}`;

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Recipe Tin', exact: true }).click();
    await page.getByRole('link', { name: 'Add Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Add Recipe' })).toBeVisible();
    await page.locator('.recipe-form').getByLabel('Name').fill(recipeName);
    await page.getByLabel('Choose recipe photos').setInputFiles({
      name: 'draft-recipe-photo.png',
      mimeType: 'image/png',
      buffer: await createImageBuffer(),
    });
    await expect(page.locator('.recipe-photo-draft-item')).toHaveCount(1);
    const [nameRowBounds, draftGridBounds] = await Promise.all([
      page.locator('.recipe-name-media-row').boundingBox(),
      page.locator('.recipe-photo-draft-grid').boundingBox(),
    ]);
    expect(nameRowBounds).not.toBeNull();
    expect(draftGridBounds).not.toBeNull();
    expect(draftGridBounds?.y).toBeGreaterThanOrEqual(
      (nameRowBounds?.y ?? 0) + (nameRowBounds?.height ?? 0),
    );

    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: recipeName })).toBeVisible();
    await expect(page.locator('.recipe-photo-feature-image')).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('owners can insert an existing recipe photo into an instruction step @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();
  const ownerAuth = ownerHeaders(anonKey, user.accessToken);
  const recipeName = `Recipe with an instruction photo ${randomUUID()}`;

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill(recipeName);
    await page
      .getByPlaceholder('Add instruction…')
      .fill('Finish the sauce. then simmer uncovered.');
    await page.getByLabel('Choose recipe photos').setInputFiles({
      name: 'instruction-reference.png',
      mimeType: 'image/png',
      buffer: await createImageBuffer(),
    });
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: recipeName })).toBeVisible();

    const recipeId = new URL(page.url()).pathname.split('/').at(-1);
    if (!recipeId) {
      throw new Error('The saved recipe URL must include its ID.');
    }
    await page.goto(`/recipes/${recipeId}/edit`);
    const instruction = page.getByRole('textbox', { name: 'Instruction step 1' });
    const triggerPosition = 'Finish the sauce. '.length;
    await instruction.focus();
    await instruction.evaluate((element, position) => {
      if (!(element instanceof HTMLTextAreaElement)) {
        throw new Error('Expected the instruction editor to be a textarea.');
      }
      element.setSelectionRange(position, position);
    }, triggerPosition);
    await instruction.pressSequentially('+p');
    await expect(page.getByRole('button', { name: /Add photo reference to step/u })).toHaveCount(0);
    const pickerPane = page.locator('.recipe-instruction-photo-picker');
    await expect(pickerPane).toBeVisible();
    const instructionRow = page.locator(
      '.recipe-instruction-edit-step:has(.recipe-instruction-photo-picker)',
    );
    await expect(pickerPane).toHaveAttribute('data-placement', 'below');
    const paneBounds = await pickerPane.boundingBox();
    const rowBounds = await instructionRow.boundingBox();
    if (!paneBounds || !rowBounds) throw new Error('Expected picker and row geometry.');
    expect(paneBounds.y).toBeGreaterThanOrEqual(rowBounds.y + rowBounds.height);
    await instructionRow.evaluate((element) => element.scrollIntoView({ block: 'end' }));
    await expect(pickerPane).toHaveAttribute('data-placement', 'above');
    const elevatedPaneBounds = await pickerPane.boundingBox();
    const elevatedRowBounds = await instructionRow.boundingBox();
    if (!elevatedPaneBounds || !elevatedRowBounds) {
      throw new Error('Expected elevated picker and row geometry.');
    }
    expect(elevatedPaneBounds.y + elevatedPaneBounds.height).toBeLessThanOrEqual(
      elevatedRowBounds.y,
    );
    const cancelChoice = page.getByRole('button', { name: /^Insert photo \d{2}$/u }).first();
    await expect(cancelChoice).toBeVisible();
    await cancelChoice.focus();
    await cancelChoice.press('Escape');
    await expect(instruction).toHaveValue('Finish the sauce. then simmer uncovered.');
    await instruction.pressSequentially('+p');
    const photoChoice = page.getByRole('button', { name: /^Insert photo \d{2}$/u }).first();
    await expect(photoChoice).toBeVisible();
    const photoCode = (await photoChoice.getAttribute('aria-label'))?.match(/\d{2}$/u)?.[0];
    if (!photoCode) throw new Error('Expected the photo picker to expose its stable code.');
    await expect(photoChoice.locator('.recipe-instruction-photo-code')).toHaveText(photoCode);
    await photoChoice.click();
    await expect(instruction).toHaveValue(
      `Finish the sauce. +photo${photoCode}then simmer uncovered.`,
    );
    await instruction.fill('Finish the sauce. then simmer uncovered.');
    await instruction.evaluate((element, position) => {
      if (!(element instanceof HTMLTextAreaElement)) {
        throw new Error('Expected the instruction editor to be a textarea.');
      }
      element.setSelectionRange(position, position);
    }, triggerPosition);
    await instruction.pressSequentially(`+photo${photoCode}-w200 `);
    await expect(instruction).toHaveValue(
      `Finish the sauce. +photo${photoCode}-w200 then simmer uncovered.`,
    );
    await instruction.press('Enter');
    const followingInstruction = page.getByRole('textbox', { name: 'Instruction step 2' });
    await followingInstruction.fill(
      'Keep stirring gently and check the seasoning while the sauce remains warm enough to coat every strand.',
    );
    await followingInstruction.press('Enter');
    await page
      .getByRole('textbox', { name: 'Instruction step 3' })
      .fill(`After resting,\n+photo${photoCode}-left`);
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: recipeName })).toBeVisible();
    await expect(page.locator('.recipe-instruction-photo .framed-media-image')).toHaveCount(2);
    const instructionPhoto = page.locator('.recipe-instruction-photo .framed-media-image').first();
    await instructionPhoto.click();
    const instructionViewer = page.locator('.image-viewer-dialog').nth(1);
    await expect(instructionViewer).toHaveJSProperty('open', true);
    await instructionViewer.getByRole('button', { name: 'Close image viewer' }).click();
    await expect(instructionViewer).toHaveJSProperty('open', false);
    const originalViewport = page.viewportSize();
    const viewportWidth = originalViewport?.width ?? 0;
    await expect(page.locator('.recipe-instruction-photo').first()).toHaveCSS(
      'float',
      viewportWidth <= 640 ? 'none' : 'right',
    );
    const intermediateViewport = originalViewport !== null && originalViewport.width > 760;
    if (intermediateViewport && originalViewport) {
      await page.setViewportSize({ ...originalViewport, width: 680 });
    }
    const photoElements = page.locator('.recipe-instruction-photo');
    const photoMargins = await photoElements.evaluateAll((elements) =>
      elements.map((element) => Number.parseFloat(getComputedStyle(element).marginBottom)),
    );
    expect(photoMargins.length).toBe(2);
    expect(photoMargins.every((margin) => margin >= 96 / 25.4)).toBe(true);
    await expect(photoElements.nth(1)).toHaveCSS(
      'float',
      (page.viewportSize()?.width ?? 0) <= 640 ? 'none' : 'left',
    );
    const photoBounds = await photoElements.first().boundingBox();
    const instructionBounds = await page.locator('.recipe-instruction-list').boundingBox();
    const leadingTextBounds = await page
      .locator('.recipe-instruction-with-photo')
      .first()
      .evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
          const text = textNode.textContent ?? '';
          const start = text.indexOf('Finish the sauce.');
          if (start >= 0) {
            const range = document.createRange();
            range.setStart(textNode, start);
            range.setEnd(textNode, start + 'Finish the sauce.'.length);
            const fragments = range.getClientRects();
            const bounds = fragments[fragments.length - 1];
            if (!bounds) throw new Error('Expected the leading text line to render.');
            return { x: bounds.x, y: bounds.y, right: bounds.right };
          }
          textNode = walker.nextNode();
        }
        throw new Error('Expected the leading instruction text to render.');
      });
    const followingTextBounds = await page
      .locator('.recipe-instruction-with-photo')
      .first()
      .evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
          const text = textNode.textContent ?? '';
          const start = text.indexOf('then simmer uncovered.');
          if (start >= 0) {
            const range = document.createRange();
            range.setStart(textNode, start);
            range.setEnd(textNode, start + 'then simmer uncovered.'.length);
            const bounds = range.getBoundingClientRect();
            return { x: bounds.x, y: bounds.y, right: bounds.right };
          }
          textNode = walker.nextNode();
        }
        throw new Error('Expected the post-photo instruction text to render.');
      });
    const followingStepTextRects = await page
      .locator('.recipe-instruction-list > li')
      .nth(1)
      .evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const textNode = walker.nextNode();
        if (!textNode) throw new Error('Expected the following instruction text to render.');
        const range = document.createRange();
        range.selectNodeContents(textNode);
        return Array.from(range.getClientRects(), ({ bottom, right, y }) => ({ bottom, right, y }));
      });
    const followingStepFirstLine = followingStepTextRects[0];
    const secondPhotoStepBounds = await page
      .locator('.recipe-instruction-list > li')
      .nth(2)
      .boundingBox();
    const secondPhotoBounds = await photoElements.nth(1).boundingBox();
    const standalonePhotoTextBounds = await page
      .locator('.recipe-instruction-list > li')
      .nth(2)
      .evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
          const text = textNode.textContent ?? '';
          const start = text.indexOf('After resting,');
          if (start >= 0) {
            const range = document.createRange();
            range.setStart(textNode, start);
            range.setEnd(textNode, start + 'After resting,'.length);
            return range.getBoundingClientRect().bottom;
          }
          textNode = walker.nextNode();
        }
        throw new Error('Expected the standalone photo instruction text to render.');
      });
    if (!photoBounds || !instructionBounds || !secondPhotoBounds) {
      throw new Error('Expected the embedded photo and instruction to have layout boxes.');
    }
    expect(photoBounds.width).toBeGreaterThan(0);
    expect(photoBounds.width).toBeLessThanOrEqual(
      Math.min(200, instructionBounds.width * (viewportWidth <= 640 ? 1 : 0.55)) + 1,
    );
    if (viewportWidth <= 640) {
      expect(leadingTextBounds.y).toBeLessThan(photoBounds.y);
      expect(followingTextBounds.y).toBeGreaterThanOrEqual(photoBounds.y + photoBounds.height - 1);
    } else {
      expect(Math.abs(leadingTextBounds.y - photoBounds.y)).toBeLessThan(8);
      expect(leadingTextBounds.right).toBeLessThanOrEqual(photoBounds.x);
      expect(followingTextBounds.right).toBeLessThanOrEqual(photoBounds.x);
    }
    if (followingStepFirstLine.y < photoBounds.y + photoBounds.height) {
      expect(followingStepFirstLine.right).toBeLessThanOrEqual(photoBounds.x);
    } else if (testInfo.project.name !== 'Fold 6') {
      throw new Error('The following instruction should wrap beside the remaining photo float.');
    }
    if (intermediateViewport) {
      expect(followingStepTextRects.length).toBeGreaterThan(1);
      for (const textRect of followingStepTextRects) {
        const overlapsPhoto =
          textRect.y < photoBounds.y + photoBounds.height && textRect.bottom > photoBounds.y;
        if (overlapsPhoto) expect(textRect.right).toBeLessThanOrEqual(photoBounds.x + 1);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    expect(secondPhotoStepBounds?.y).toBeGreaterThanOrEqual(photoBounds.y + photoBounds.height);
    expect(standalonePhotoTextBounds).toBeLessThan(secondPhotoBounds.y);
    if (intermediateViewport && originalViewport) {
      await page.setViewportSize(originalViewport);
    }
    await page.goto(`/recipes/${recipeId}/edit`);
    await page.getByRole('button', { name: 'Manage recipe photos' }).click();
    const photoDialog = page.getByRole('dialog', { name: 'Manage recipe photos' });
    await photoDialog.getByRole('button', { name: 'Remove photo 1' }).click();
    const confirmation = photoDialog.getByRole('alertdialog', {
      name: 'Remove referenced photo?',
    });
    await expect(confirmation).toContainText('instruction steps 1, 3');
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(photoDialog.getByRole('button', { name: 'Remove photo 1' })).toBeVisible();

    await photoDialog.getByRole('button', { name: 'Remove photo 1' }).click();
    await photoDialog
      .getByRole('alertdialog')
      .getByRole('button', {
        name: 'Remove photo and references',
      })
      .click();
    await expect(photoDialog.getByRole('button', { name: /Remove photo/ })).toHaveCount(0);
    await photoDialog.getByRole('button', { name: 'Done' }).click();
    await page.goto(`/recipes/${recipeId}`);
    await expect(page.getByText('Finish the sauce.')).toBeVisible();
    await expect(page.locator('.recipe-instruction-photo .framed-media-image')).toHaveCount(0);
    await expect(page.locator('.recipe-photo-feature-image')).toHaveCount(0);

    const historyResponse = await request.get(
      `${apiUrl}/rest/v1/recipe_history?select=event_type,before_data,after_data&record_id=eq.${recipeId}&order=created_at.desc,id.desc`,
      { headers: ownerAuth },
    );
    expect(historyResponse.ok(), await historyResponse.text()).toBeTruthy();
    const history = (await historyResponse.json()) as {
      event_type: string;
      before_data: { steps?: { content_markdown: string }[] } | null;
      after_data: { steps?: { content_markdown: string }[] };
    }[];
    const photoRemoval = history.find(
      (event) =>
        event.event_type === 'recipe.updated' &&
        event.before_data?.steps?.some((step) => step.content_markdown.includes('[[photo:')) &&
        event.after_data.steps?.every((step) => !step.content_markdown.includes('[[photo:')),
    );
    expect(photoRemoval).toBeDefined();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('instruction photo references reject invalid assets and stale removal versions @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const { apiUrl, anonKey, serviceRoleKey } = await getLocalSupabaseConfig();
  const ownerAuth = ownerHeaders(anonKey, owner.accessToken);
  const service = serviceHeaders(serviceRoleKey);
  const stepId = randomUUID();
  const recipeId = await createRecipe(request, apiUrl, ownerAuth, `Photo guard ${randomUUID()}`, [
    { id: stepId, position: 0, content_markdown: 'Stir the sauce.', plain_text: 'Stir the sauce.' },
  ]);
  const otherRecipeId = await createRecipe(
    request,
    apiUrl,
    ownerAuth,
    `Other photo recipe ${randomUUID()}`,
  );

  try {
    const localPhotoId = await createReadyRecipePhoto(
      request,
      apiUrl,
      ownerAuth,
      service,
      recipeId,
    );
    const secondLocalPhotoId = await createReadyRecipePhoto(
      request,
      apiUrl,
      ownerAuth,
      service,
      recipeId,
    );
    const localPhotoIds = [localPhotoId, secondLocalPhotoId];
    const photoCodesResponse = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=id,reference_code&id=in.(${localPhotoIds.join(',')})`,
      { headers: ownerAuth },
    );
    expect(photoCodesResponse.ok(), await photoCodesResponse.text()).toBeTruthy();
    const photoCodes = (await photoCodesResponse.json()) as {
      id: string;
      reference_code: number;
    }[];
    expect(photoCodes).toHaveLength(2);
    expect(new Set(photoCodes.map((photo) => photo.reference_code)).size).toBe(2);
    expect(
      photoCodes.every((photo) => photo.reference_code >= 0 && photo.reference_code <= 99),
    ).toBe(true);
    const codesByAssetId = new Map(photoCodes.map((photo) => [photo.id, photo.reference_code]));
    const reorderResponse = await request.post(`${apiUrl}/rest/v1/rpc/reorder_recipe_photos`, {
      headers: ownerAuth,
      data: {
        p_recipe_id: recipeId,
        p_asset_ids: [secondLocalPhotoId, localPhotoId],
      },
    });
    expect(reorderResponse.ok(), await reorderResponse.text()).toBeTruthy();
    const reorderedCodesResponse = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=id,reference_code&id=in.(${localPhotoIds.join(',')})`,
      { headers: ownerAuth },
    );
    expect(reorderedCodesResponse.ok(), await reorderedCodesResponse.text()).toBeTruthy();
    const reorderedCodes = (await reorderedCodesResponse.json()) as typeof photoCodes;
    expect(new Map(reorderedCodes.map((photo) => [photo.id, photo.reference_code]))).toEqual(
      codesByAssetId,
    );

    const foreignPhotoId = await createReadyRecipePhoto(
      request,
      apiUrl,
      ownerAuth,
      service,
      otherRecipeId,
    );
    const pendingPhotoResponse = await request.post(`${apiUrl}/rest/v1/rpc/reserve_media_upload`, {
      headers: ownerAuth,
      data: { p_parent_type: 'recipe', p_parent_id: recipeId },
    });
    expect(pendingPhotoResponse.ok(), await pendingPhotoResponse.text()).toBeTruthy();
    const pendingPhotoId = (await pendingPhotoResponse.json()) as string;

    for (const invalidAssetId of [foreignPhotoId, pendingPhotoId]) {
      expect(() =>
        runLocalSql(`
          update public.recipe_steps
          set content_markdown = 'Stir the sauce. [[photo:${invalidAssetId}]]'
          where id = '${stepId}'::uuid and recipe_id = '${recipeId}'::uuid;
        `),
      ).toThrow();
    }

    const stepResponse = await request.get(
      `${apiUrl}/rest/v1/recipe_steps?select=content_markdown&id=eq.${stepId}`,
      { headers: ownerAuth },
    );
    expect(await stepResponse.json()).toEqual([{ content_markdown: 'Stir the sauce.' }]);

    const staleDelete = await request.post(
      `${apiUrl}/rest/v1/rpc/delete_recipe_photo_with_references`,
      {
        headers: ownerAuth,
        data: { p_asset_id: localPhotoId, p_expected_version: 0 },
      },
    );
    expect(staleDelete.ok()).toBeFalsy();
    expect((await staleDelete.json()).code).toBe('PT409');

    const retainedPhoto = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=id&id=eq.${localPhotoId}`,
      { headers: ownerAuth },
    );
    expect(await retainedPhoto.json()).toEqual([{ id: localPhotoId }]);
  } finally {
    await deleteTestUser(request, owner);
  }
});

test('image management panes stage covers and immediately manage decorative recipe photos @e2e @a11y', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const owner = await createTestUser(request);
  const otherOwner = await createTestUser(request);
  const { apiUrl, anonKey, serviceRoleKey } = await getLocalSupabaseConfig();
  const headers = ownerHeaders(anonKey, owner.accessToken);
  const publicationName = `Media Cookbook ${randomUUID()}`;
  const recipeName = `Media Recipe ${randomUUID()}`;

  try {
    const publicationId = await createBook(request, apiUrl, headers, publicationName);
    const recipeId = await createRecipe(request, apiUrl, headers, recipeName);
    const imageBuffer = await createImageBuffer();
    await signIn(page, owner.email, owner.password);

    await page.goto(`/publications/${publicationId}`);
    await expect(page.getByRole('heading', { name: publicationName })).toBeVisible();
    const viewportSize = page.viewportSize() ?? { width: 1280, height: 800 };
    const viewportWidth = viewportSize.width;
    if (viewportWidth <= 340) {
      const viewControls = await page.locator('.recipe-explorer-view-controls').boundingBox();
      const columnsButton = page.getByRole('button', { name: 'Choose List columns' }).first();
      const columnsBounds = await columnsButton.boundingBox();
      const firstActionBounds = await page
        .locator('.publication-mobile-actions > *')
        .first()
        .boundingBox();
      expect(viewControls).not.toBeNull();
      expect(columnsBounds).not.toBeNull();
      expect(firstActionBounds).not.toBeNull();
      if (!viewControls || !columnsBounds || !firstActionBounds) {
        throw new Error('Expected the narrow publication toolbar controls to be visible');
      }
      expect(columnsBounds.x + columnsBounds.width).toBeGreaterThanOrEqual(
        viewControls.x + viewControls.width - 1,
      );
      const rightBorderWidth = await columnsButton.evaluate(
        (button) => getComputedStyle(button).borderRightWidth,
      );
      expect(Number.parseFloat(rightBorderWidth)).toBeGreaterThan(0);
      if (Math.abs(firstActionBounds.y - columnsBounds.y) <= 1) {
        expect(firstActionBounds.x).toBeGreaterThanOrEqual(columnsBounds.x + columnsBounds.width);
      } else {
        expect(firstActionBounds.y).toBeGreaterThanOrEqual(columnsBounds.y + columnsBounds.height);
      }
    }
    await expect(page.locator('.publication-cover-manager-pencil')).toHaveCount(0);
    await expect(
      page.locator('.publication-detail-heading .publication-cover-image-content'),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit publication' }).click();
    const publicationEditor = page.getByRole('dialog', { name: 'Edit publication' });
    await expect(publicationEditor).toBeVisible();
    await expect(publicationEditor.locator('.publication-cover-manager-pencil')).toBeVisible();
    await page.getByRole('button', { name: `Manage ${publicationName} cover` }).click();
    const coverDialog = page.getByRole('dialog', { name: 'Manage publication cover' });
    await expect(coverDialog).toBeVisible();
    await expect(coverDialog.getByRole('textbox', { name: 'Paste an image here' })).toHaveAttribute(
      'placeholder',
      expect.stringContaining('Ctrl+V'),
    );
    await coverDialog.evaluate((dialog) => {
      dialog
        .querySelector<HTMLInputElement>('input[aria-label="Choose cover image"]')
        ?.dispatchEvent(new Event('cancel', { bubbles: true }));
    });
    await expect(coverDialog).toBeVisible();
    await expect(coverDialog.locator('.media-camera-picker')).toHaveCount(0);
    await expect(coverDialog.locator('input[aria-label="Take cover photo"]')).toHaveCount(0);
    const coverControls = await Promise.all([
      coverDialog.locator('.media-icon-action').first().boundingBox(),
      coverDialog.getByRole('button', { name: 'Cancel' }).boundingBox(),
      coverDialog.getByRole('button', { name: 'Submit' }).boundingBox(),
    ]);
    expect(coverControls.every(Boolean)).toBe(true);
    expect(Math.max(...coverControls.map((box) => box?.y ?? 0))).toBeLessThanOrEqual(
      Math.min(...coverControls.map((box) => (box?.y ?? 0) + (box?.height ?? 0))),
    );
    await coverDialog.locator('input[aria-label="Choose cover image"]').setInputFiles({
      name: 'invalid.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not an image'),
    });
    await coverDialog.getByRole('button', { name: 'Submit' }).click();
    await expect(coverDialog.locator('.media-manager-error')).toContainText(
      'Choose a JPEG, PNG, WebP, or HEIC image.',
    );
    await coverDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(coverDialog).not.toBeVisible();

    const abandonedReservation = await page.evaluate(async (parentId) => {
      const response = await fetch('/api/media/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentType: 'publication', parentId }),
      });
      return { ok: response.ok, status: response.status };
    }, publicationId);
    expect(abandonedReservation.ok, `Reservation failed: ${abandonedReservation.status}`).toBe(
      true,
    );

    await page.getByRole('button', { name: `Manage ${publicationName} cover` }).click();
    await coverDialog.locator('input[aria-label="Choose cover image"]').setInputFiles({
      name: 'cover.png',
      mimeType: 'image/png',
      buffer: imageBuffer,
    });
    await expect(coverDialog.locator('.publication-cover-editor-image')).toBeVisible();
    await coverDialog.getByRole('button', { name: 'Submit' }).click();
    await expect(coverDialog.locator('.media-manager-error')).toHaveText(
      'A cover upload is already in progress.',
    );
    const recoveryButton = coverDialog.getByRole('button', { name: 'Cancel upload and retry' });
    await page.route('**/api/media/uploads', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Unable to cancel the incomplete upload.' }),
        });
        return;
      }
      await route.continue();
    });
    await recoveryButton.click();
    await expect(coverDialog.locator('.media-manager-error')).toHaveText(
      'Unable to cancel the incomplete upload.',
    );
    await expect(recoveryButton).toBeVisible();
    await page.unroute('**/api/media/uploads');
    await recoveryButton.click();
    await expect(coverDialog).not.toBeVisible();
    await expect(
      page.locator('.publication-edit-cover .publication-cover-manager-image'),
    ).toBeVisible();
    await expect(
      page.locator('.publication-edit-cover .publication-cover-manager-image'),
    ).toHaveCSS('object-fit', 'contain');
    await expect(
      page.locator('.publication-detail-heading .publication-cover-image-content'),
    ).toBeVisible();
    const coverResponse = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=full_path&publication_id=eq.${publicationId}&status=eq.ready`,
      { headers: serviceHeaders(serviceRoleKey) },
    );
    expect(coverResponse.ok(), await coverResponse.text()).toBeTruthy();
    const [cover] = (await coverResponse.json()) as { full_path: string }[];
    const foreignStorageRead = await request.get(
      `${apiUrl}/storage/v1/object/authenticated/recipe-media/${cover.full_path}`,
      { headers: ownerHeaders(anonKey, otherOwner.accessToken) },
    );
    expect(foreignStorageRead.ok()).toBe(false);

    await page.getByRole('button', { name: `Manage ${publicationName} cover` }).click();
    await coverDialog.getByRole('button', { name: 'Adjust cover framing' }).click();
    await page.getByRole('combobox', { name: 'Aspect ratio' }).click();
    await page.getByRole('option', { name: 'Square' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(coverDialog.getByRole('button', { name: 'Submit' })).toBeEnabled();
    const stagedCoverCropResponse = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=crop&publication_id=eq.${publicationId}&status=eq.ready`,
      { headers },
    );
    expect(stagedCoverCropResponse.ok(), await stagedCoverCropResponse.text()).toBeTruthy();
    expect(await stagedCoverCropResponse.json()).toEqual([{ crop: null }]);
    await coverDialog.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: `Manage ${publicationName} cover` }).click();
    const coverCropCancelResponse = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=crop&publication_id=eq.${publicationId}&status=eq.ready`,
      { headers },
    );
    expect(coverCropCancelResponse.ok(), await coverCropCancelResponse.text()).toBeTruthy();
    expect(await coverCropCancelResponse.json()).toEqual([{ crop: null }]);
    await coverDialog.getByRole('button', { name: 'Adjust cover framing' }).click();
    await page.getByRole('combobox', { name: 'Aspect ratio' }).click();
    await page.getByRole('option', { name: 'Square' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    await coverDialog.getByRole('button', { name: 'Submit' }).click();
    await expect(coverDialog).not.toBeVisible();
    const savedCoverCropResponse = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=crop&publication_id=eq.${publicationId}&status=eq.ready`,
      { headers },
    );
    expect(savedCoverCropResponse.ok(), await savedCoverCropResponse.text()).toBeTruthy();
    expect((await savedCoverCropResponse.json())[0].crop).not.toBeNull();

    await page.getByRole('button', { name: `Manage ${publicationName} cover` }).click();
    const coverRemove = coverDialog.getByRole('button', { name: 'Remove cover image' });
    const removeStyles = await coverRemove.evaluate((button) => ({
      background: getComputedStyle(button).backgroundColor,
      color: getComputedStyle(button).color,
    }));
    expect(removeStyles.background).toBe('rgb(255, 255, 255)');
    expect(removeStyles.color).not.toBe('rgb(255, 255, 255)');
    await coverDialog.locator('input[aria-label="Choose cover image"]').setInputFiles({
      name: 'replacement-cover.png',
      mimeType: 'image/png',
      buffer: imageBuffer,
    });
    await coverDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      page.locator('.publication-edit-cover .publication-cover-manager-image'),
    ).toBeVisible();
    const coverAxe = await new AxeBuilder({ page }).analyze();
    expect(coverAxe.violations).toEqual([]);

    await page.getByRole('button', { name: `Manage ${publicationName} cover` }).click();
    await page.evaluate((encodedImage) => {
      const bytes = Uint8Array.from(atob(encodedImage), (character) => character.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'pasted-cover.png', { type: 'image/png' }));
      document
        .querySelector('.media-manager-paste-hint')
        ?.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: transfer }));
    }, imageBuffer.toString('base64'));
    await expect(coverDialog.locator('.publication-cover-editor-image')).toBeVisible();
    await coverDialog.getByRole('button', { name: 'Cancel' }).click();

    await page.goto(`/recipes/${recipeId}/edit`);
    await expect(page.locator('.recipe-photo-manager-trigger svg')).toBeVisible();
    await expect(page.locator('.recipe-photo-manager-trigger .framed-media-image')).toHaveCount(0);
    await expect(page.locator('.recipe-photo-manager-pencil')).toHaveCount(0);
    if (viewportWidth <= 640) {
      const nameBox = await page.locator('.recipe-name-field').boundingBox();
      const cameraBox = await page
        .getByRole('button', { name: 'Manage recipe photos' })
        .boundingBox();
      expect(nameBox).not.toBeNull();
      expect(cameraBox).not.toBeNull();
      expect(Math.abs((nameBox?.height ?? 0) - (cameraBox?.height ?? 0))).toBeLessThanOrEqual(1);
    } else {
      const nameRow = await page.locator('.recipe-name-media-row').boundingBox();
      const cameraBox = await page
        .getByRole('button', { name: 'Manage recipe photos' })
        .boundingBox();
      expect(nameRow).not.toBeNull();
      expect(cameraBox).not.toBeNull();
      expect(
        Math.abs(
          (nameRow?.x ?? 0) +
            (nameRow?.width ?? 0) -
            ((cameraBox?.x ?? 0) + (cameraBox?.width ?? 0)),
        ),
      ).toBeLessThanOrEqual(1);
    }
    await page.getByRole('button', { name: 'Manage recipe photos' }).click();
    const photoDialog = page.getByRole('dialog', { name: 'Manage recipe photos' });
    await expect(photoDialog).toBeVisible();
    await expect(photoDialog.locator('#media-manager-title')).toBeFocused();
    if (viewportWidth <= 640) {
      const pasteAction = photoDialog.getByRole('button', { name: 'Paste image from clipboard' });
      await expect(pasteAction).toBeVisible();
      await expect(photoDialog.getByRole('textbox', { name: 'Paste an image here' })).toHaveCount(
        0,
      );
      await page.keyboard.press('Tab');
      await expect(pasteAction).toBeFocused();
    } else {
      const pasteInstruction = photoDialog.locator('.media-manager-paste-instruction-desktop');
      await expect(pasteInstruction).toHaveText('Paste an image with Ctrl+V or Command+V.');
      await expect(photoDialog.getByRole('textbox', { name: 'Paste an image here' })).toBeHidden();
      const [title, instruction] = await Promise.all([
        photoDialog.locator('#media-manager-title').boundingBox(),
        pasteInstruction.boundingBox(),
      ]);
      expect(title).not.toBeNull();
      expect(instruction).not.toBeNull();
      expect(instruction?.y).toBeGreaterThan((title?.y ?? 0) + (title?.height ?? 0));
    }
    const devicePicker = photoDialog.getByLabel('Upload from device');
    await expect(devicePicker).not.toHaveAttribute('capture');
    const cameraPicker = photoDialog.getByLabel('Take photo with camera');
    await expect(cameraPicker).toHaveAttribute('capture', 'environment');
    if (viewportWidth <= 640) {
      await expect(photoDialog.locator('.recipe-photo-camera-tile')).toBeVisible();
    } else {
      await expect(photoDialog.locator('.recipe-photo-camera-tile')).toBeHidden();
    }
    await devicePicker.setInputFiles([
      ...Array.from({ length: 5 }, (_, index) => ({
        name: `photo-${index + 1}.png`,
        mimeType: 'image/png',
        buffer: imageBuffer,
      })),
      {
        name: 'still-tiny.heic',
        mimeType: 'image/heic',
        buffer: await readFile('tests/fixtures/media/still-tiny.heic'),
      },
    ]);
    await expect(photoDialog.locator('.recipe-photo-grid-item')).toHaveCount(6);
    const framingAction = photoDialog.getByRole('button', { name: 'Adjust framing for photo 1' });
    await expect(framingAction).toHaveCSS('width', '28px');
    await expect(framingAction).toHaveCSS('height', '28px');
    if (viewportWidth <= 640) {
      await page.setViewportSize({ ...viewportSize, width: 300 });
    }
    await framingAction.click();
    await expect(page.getByRole('dialog', { name: 'Adjust image framing' })).toBeVisible();
    await expect(page.locator('.media-manager-heading')).toHaveCount(0);
    const ratioPicklist = page.getByRole('combobox', { name: 'Aspect ratio' });
    const ratioPickerSizing = await ratioPicklist.evaluate((element) => {
      const { width } = element.getBoundingClientRect();
      const measurement = element.previousElementSibling;
      const longestLabelWidth =
        measurement?.classList.contains('single-picklist-measure') === true
          ? measurement.getBoundingClientRect().width
          : undefined;
      return {
        expectedWidth: longestLabelWidth ? Math.ceil(longestLabelWidth + 16) + 96 / 25.4 : 0,
        width,
      };
    });
    expect(Math.abs(ratioPickerSizing.width - ratioPickerSizing.expectedWidth)).toBeLessThan(1);
    expect(ratioPickerSizing.width).toBeLessThan(160);
    await ratioPicklist.click();
    await page.getByRole('option', { name: '16:9' }).click();
    await expect(page.locator('.image-crop-editor-rotation-value')).toHaveCount(0);
    await expect(page.getByLabel('Current image rotation')).toHaveCount(0);
    await expect(page.getByLabel('Zoom image')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Move image/ })).toHaveCount(0);
    await expect(page.getByText('Aspect ratio', { exact: true })).toHaveCount(0);
    const cropperStage = page.locator('.image-crop-editor-stage');
    const canvasBeforeRotation = await cropperStage.boundingBox();
    expect(canvasBeforeRotation).not.toBeNull();
    expect(canvasBeforeRotation?.width).toBeGreaterThan(canvasBeforeRotation?.height ?? 0);
    const cropImage = page.locator('.react-advanced-cropper__image');
    const transformBeforePan = await cropImage.evaluate(
      (image) => getComputedStyle(image).transform,
    );
    const stageBounds = await cropperStage.boundingBox();
    expect(stageBounds).not.toBeNull();
    await page.mouse.move(
      (stageBounds?.x ?? 0) + (stageBounds?.width ?? 0) / 2,
      (stageBounds?.y ?? 0) + (stageBounds?.height ?? 0) / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      (stageBounds?.x ?? 0) + (stageBounds?.width ?? 0) / 2 + 18,
      (stageBounds?.y ?? 0) + (stageBounds?.height ?? 0) / 2 + 12,
    );
    await page.mouse.up();
    await expect
      .poll(async () => cropImage.evaluate((image) => getComputedStyle(image).transform))
      .not.toBe(transformBeforePan);
    const transformBeforeWheel = await cropImage.evaluate(
      (image) => getComputedStyle(image).transform,
    );
    await ratioPicklist.hover();
    await page.mouse.wheel(0, -120);
    await expect
      .poll(async () => cropImage.evaluate((image) => getComputedStyle(image).transform))
      .toBe(transformBeforeWheel);
    await cropperStage.hover();
    await page.mouse.wheel(0, -120);
    await expect
      .poll(async () => cropImage.evaluate((image) => getComputedStyle(image).transform))
      .not.toBe(transformBeforeWheel);
    const canvasDimensionsBeforeRotation = await cropperStage.boundingBox();
    expect(canvasDimensionsBeforeRotation).not.toBeNull();
    const cropFrame = page.locator('.advanced-cropper-stencil-wrapper');
    const frameBeforeRotation = await cropFrame.boundingBox();
    expect(frameBeforeRotation).not.toBeNull();
    expect(frameBeforeRotation?.width).toBeGreaterThan(frameBeforeRotation?.height ?? 0);
    const rotateButton = page.getByRole('button', {
      name: 'Rotate image counterclockwise 90 degrees',
    });
    for (let rotationAction = 0; rotationAction < 5; rotationAction += 1) {
      await rotateButton.click();
      await expect(rotateButton).toBeEnabled();
    }
    await ratioPicklist.click();
    await expect(page.getByRole('option', { name: '9:16' })).toBeVisible();
    const frameAfterRotation = await cropFrame.boundingBox();
    expect(frameAfterRotation).not.toBeNull();
    expect(frameAfterRotation?.height).toBeGreaterThan(frameAfterRotation?.width ?? 0);
    const canvasAfterRotation = await cropperStage.boundingBox();
    expect(canvasAfterRotation).not.toBeNull();
    expect(canvasAfterRotation?.height).toBeGreaterThan(canvasAfterRotation?.width ?? 0);
    if (viewportWidth <= 640) {
      const [ratioBounds, rotateBounds, actionsBounds, toolbarBounds] = await Promise.all([
        ratioPicklist.boundingBox(),
        rotateButton.boundingBox(),
        page.locator('.image-crop-editor-actions').boundingBox(),
        page.locator('.image-crop-editor-controls').boundingBox(),
      ]);
      expect([ratioBounds, rotateBounds, actionsBounds, toolbarBounds].every(Boolean)).toBe(true);
      if (!ratioBounds || !rotateBounds || !actionsBounds || !toolbarBounds) {
        throw new Error('Expected the compact crop controls to have layout bounds.');
      }
      const controlTops = [ratioBounds.y, rotateBounds.y, actionsBounds.y];
      expect(Math.max(...controlTops) - Math.min(...controlTops)).toBeLessThanOrEqual(2);
      expect(
        Math.max(
          ratioBounds.x + ratioBounds.width,
          rotateBounds.x + rotateBounds.width,
          actionsBounds.x + actionsBounds.width,
        ),
      ).toBeLessThanOrEqual(toolbarBounds.x + toolbarBounds.width + 1);
      const cropDialog = page.getByRole('dialog', { name: 'Adjust image framing' });
      expect(await cropDialog.evaluate((dialog) => dialog.scrollWidth > dialog.clientWidth)).toBe(
        false,
      );
    }
    await page.getByRole('option', { name: '4:3' }).click();
    await expect(ratioPicklist).toContainText('3:4');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(ratioPicklist).toContainText('Free');
    await expect
      .poll(async () => {
        const bounds = await cropperStage.boundingBox();
        return Boolean(
          bounds &&
            canvasBeforeRotation &&
            Math.abs(bounds.width - canvasBeforeRotation.width) < 2 &&
            Math.abs(bounds.height - canvasBeforeRotation.height) < 2,
        );
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const [stageBounds, frameBounds] = await Promise.all([
          cropperStage.boundingBox(),
          cropFrame.boundingBox(),
        ]);
        return Boolean(
          stageBounds &&
            frameBounds &&
            Math.abs(stageBounds.x - frameBounds.x) < 2 &&
            Math.abs(stageBounds.y - frameBounds.y) < 2 &&
            Math.abs(stageBounds.width - frameBounds.width) < 2 &&
            Math.abs(stageBounds.height - frameBounds.height) < 2,
        );
      })
      .toBe(true);
    await expect(rotateButton).toBeEnabled();
    await rotateButton.click();
    await expect
      .poll(async () => {
        const bounds = await cropperStage.boundingBox();
        return Boolean(bounds && bounds.height > bounds.width);
      })
      .toBe(true);
    await ratioPicklist.click();
    await page.getByRole('option', { name: '4:3' }).click();
    await expect(ratioPicklist).toContainText('3:4');
    const cropPatchRequest = page.waitForRequest(
      (candidate) =>
        candidate.method() === 'PATCH' &&
        new URL(candidate.url()).pathname.startsWith('/api/media/assets/'),
    );
    const cropPatchResponse = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'PATCH' &&
        new URL(candidate.url()).pathname.startsWith('/api/media/assets/'),
    );
    await page.getByRole('button', { name: 'Apply' }).click();
    const cropPatchBody = (await cropPatchRequest).postDataJSON() as {
      action: string;
      crop: unknown;
    };
    const cropPatchResult = await (await cropPatchResponse).json();
    expect(cropPatchBody.action).toBe('crop');
    expect(cropPatchBody.crop).not.toBeNull();
    expect(cropPatchBody.crop).toMatchObject({ rotation: 270 });
    expect(cropPatchResult, JSON.stringify(cropPatchBody)).toHaveProperty('version');
    const savedPhotoCropResponse = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=id,crop&recipe_id=eq.${recipeId}&status=eq.ready`,
      { headers },
    );
    expect(savedPhotoCropResponse.ok(), await savedPhotoCropResponse.text()).toBeTruthy();
    const savedPhotoCrops = (await savedPhotoCropResponse.json()) as {
      id: string;
      crop: { rotation?: number } | null;
    }[];
    expect(savedPhotoCrops.some((asset) => asset.crop?.rotation === 270)).toBe(true);
    await expect(
      photoDialog.locator('.recipe-photo-grid-item.is-default .recipe-photo-grid-image image'),
    ).toHaveAttribute('transform', /rotate\(270\)/);
    await photoDialog.getByRole('button', { name: 'Adjust framing for photo 1' }).click();
    await expect(page.locator('.image-crop-editor-rotation-value')).toHaveCount(0);
    if (viewportWidth <= 640) {
      await page.setViewportSize(viewportSize);
    }
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      photoDialog.locator(
        '.recipe-photo-add-tile:not(.recipe-photo-camera-tile) .recipe-photo-add-action span',
      ),
    ).toHaveCSS('text-align', 'center');
    await expect(page.locator('.recipe-photo-manager-trigger .framed-media-image')).toBeVisible();
    await expect(page.locator('.recipe-photo-manager-trigger .framed-media-image')).toHaveCSS(
      'object-fit',
      'contain',
    );
    const [nameInputBounds, photoBounds] = await Promise.all([
      page.locator('.recipe-name-field input').boundingBox(),
      page.locator('.recipe-photo-manager-trigger .framed-media-image').boundingBox(),
    ]);
    expect(nameInputBounds).not.toBeNull();
    expect(photoBounds).not.toBeNull();
    expect(
      Math.abs(
        (photoBounds?.y ?? 0) +
          (photoBounds?.height ?? 0) -
          ((nameInputBounds?.y ?? 0) + (nameInputBounds?.height ?? 0)),
      ),
    ).toBeLessThanOrEqual(1);
    await expect(page.locator('.recipe-photo-manager-pencil')).toBeVisible();
    const triggerPhotoSource = await page
      .locator('.recipe-photo-manager-trigger .framed-media-image image')
      .getAttribute('href');
    const primaryGridPhotoSource = await photoDialog
      .locator('.recipe-photo-grid-item.is-default .recipe-photo-grid-image image')
      .getAttribute('href');
    expect(triggerPhotoSource).toBe(primaryGridPhotoSource);
    const heicAssetResponse = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=width,height,full_path,thumbnail_path&recipe_id=eq.${recipeId}&status=eq.ready&width=eq.320&height=eq.427`,
      { headers },
    );
    expect(heicAssetResponse.ok(), await heicAssetResponse.text()).toBeTruthy();
    const [heicAsset] = (await heicAssetResponse.json()) as {
      width: number;
      height: number;
      full_path: string;
      thumbnail_path: string;
    }[];
    expect(heicAsset).toMatchObject({ width: 320, height: 427 });
    for (const path of [heicAsset.full_path, heicAsset.thumbnail_path]) {
      const storedImage = await request.get(
        `${apiUrl}/storage/v1/object/authenticated/recipe-media/${path}`,
        { headers },
      );
      expect(storedImage.ok(), await storedImage.text()).toBeTruthy();
      const storedMetadata = await sharp(await storedImage.body()).metadata();
      expect(storedMetadata.format).toBe('webp');
      expect(storedMetadata.exif).toBeUndefined();
      expect(storedMetadata.iptc).toBeUndefined();
      expect(storedMetadata.xmp).toBeUndefined();
    }
    if (viewportWidth <= 640) {
      await page.evaluate((encodedImage) => {
        const bytes = Uint8Array.from(atob(encodedImage), (character) => character.charCodeAt(0));
        const image = new Blob([bytes], { type: 'image/png' });
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            read: async () => [
              {
                types: ['image/png'],
                getType: async () => image,
              },
            ],
          },
        });
      }, imageBuffer.toString('base64'));
      await photoDialog.getByRole('button', { name: 'Paste image from clipboard' }).click();
    } else {
      await page.evaluate((encodedImage) => {
        const bytes = Uint8Array.from(atob(encodedImage), (character) => character.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], 'pasted-photo.png', { type: 'image/png' }));
        document
          .querySelector('.media-manager-dialog')
          ?.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: transfer }));
      }, imageBuffer.toString('base64'));
    }
    await expect(photoDialog.locator('.recipe-photo-grid-item')).toHaveCount(7);
    await expect(
      photoDialog.locator('.recipe-photo-add-tile:not(.recipe-photo-camera-tile)'),
    ).toBeVisible();
    const photoStatus = photoDialog.locator('.media-manager-status:visible');
    await expect(photoStatus).toBeVisible();
    const photoActions = await Promise.all([
      photoDialog.locator('.media-manager-photo-meta').boundingBox(),
      photoDialog.locator('.media-manager-dialog-footer button').boundingBox(),
      photoDialog.locator('.recipe-photo-add-tile:not(.recipe-photo-camera-tile)').boundingBox(),
      photoDialog.locator('.recipe-photo-grid-item').first().boundingBox(),
      photoDialog.locator('.recipe-photo-remove-icon').first().boundingBox(),
    ]);
    expect(photoActions.every(Boolean)).toBe(true);
    expect(
      Math.abs(
        (photoActions[3]?.x ?? 0) +
          (photoActions[3]?.width ?? 0) -
          ((photoActions[4]?.x ?? 0) + (photoActions[4]?.width ?? 0) / 2),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        (photoActions[3]?.y ?? 0) -
          ((photoActions[4]?.y ?? 0) + (photoActions[4]?.height ?? 0) / 2),
      ),
    ).toBeLessThanOrEqual(1);
    const photoRemoveStyles = await photoDialog
      .locator('.recipe-photo-remove-icon')
      .first()
      .evaluate((button) => ({
        background: getComputedStyle(button).backgroundColor,
        color: getComputedStyle(button).color,
      }));
    expect(photoRemoveStyles.background).toBe('rgb(255, 255, 255)');
    expect(photoRemoveStyles.color).not.toBe('rgb(255, 255, 255)');
    const countBox = await photoDialog.locator('.media-manager-count').boundingBox();
    expect(countBox).not.toBeNull();
    if (viewportWidth > 640) {
      const instruction = photoDialog.locator('.media-manager-paste-instruction-desktop');
      const [heading, title, headingStatus, instructionBox] = await Promise.all([
        photoDialog.locator('.media-manager-heading').boundingBox(),
        photoDialog.locator('#media-manager-title').boundingBox(),
        photoDialog.locator('.media-manager-photo-status-desktop').boundingBox(),
        instruction.boundingBox(),
      ]);
      expect(heading).not.toBeNull();
      expect(title).not.toBeNull();
      expect(headingStatus).not.toBeNull();
      expect(instructionBox).not.toBeNull();
      expect(
        Math.abs(
          (title?.y ?? 0) +
            (title?.height ?? 0) / 2 -
            ((headingStatus?.y ?? 0) + (headingStatus?.height ?? 0) / 2),
        ),
      ).toBeLessThanOrEqual(6);
      expect(
        Math.abs(
          (headingStatus?.x ?? 0) +
            (headingStatus?.width ?? 0) -
            ((heading?.x ?? 0) + (heading?.width ?? 0)),
        ),
      ).toBeLessThanOrEqual(1);
      expect(Math.abs((instructionBox?.x ?? 0) - (photoActions[0]?.x ?? 0))).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          (countBox?.x ?? 0) +
            (countBox?.width ?? 0) -
            ((photoActions[0]?.x ?? 0) + (photoActions[0]?.width ?? 0)),
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          (instructionBox?.y ?? 0) +
            (instructionBox?.height ?? 0) / 2 -
            ((countBox?.y ?? 0) + (countBox?.height ?? 0) / 2),
        ),
      ).toBeLessThanOrEqual(1);
      expect(await instruction.evaluate((element) => getComputedStyle(element).textAlign)).toBe(
        'left',
      );
    } else {
      expect(Math.abs((countBox?.x ?? 0) - (photoActions[0]?.x ?? 0))).toBeLessThanOrEqual(1);
      const statusBox = await photoStatus.boundingBox();
      expect(statusBox).not.toBeNull();
      expect(
        Math.abs(
          (statusBox?.x ?? 0) +
            (statusBox?.width ?? 0) -
            ((photoActions[0]?.x ?? 0) + (photoActions[0]?.width ?? 0)),
        ),
      ).toBeLessThanOrEqual(1);
    }
    expect(
      Math.abs(
        (photoActions[0]?.y ?? 0) +
          (photoActions[0]?.height ?? 0) / 2 -
          (countBox?.y ?? 0) -
          (countBox?.height ?? 0) / 2,
      ),
    ).toBeLessThanOrEqual(1);
    await expect(photoDialog.locator('.recipe-photo-grid-item.is-default')).toHaveCount(1);
    await expect(photoDialog.locator('.recipe-photo-grid-image').first()).toHaveAttribute('width');
    await expect(photoDialog.locator('.recipe-photo-grid-image').first()).toHaveAttribute('height');
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    const dialogDimensions = await photoDialog.evaluate((dialog) => ({
      clientWidth: dialog.clientWidth,
      scrollWidth: dialog.scrollWidth,
    }));
    expect(dialogDimensions.scrollWidth).toBeLessThanOrEqual(dialogDimensions.clientWidth);
    const initialOrder = await photoDialog
      .locator('.recipe-photo-grid-item')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-photo-id')));
    const movedPhotoButton = photoDialog.locator(
      `[data-photo-id="${initialOrder[0]}"] .recipe-photo-grid-select`,
    );
    await photoDialog.locator('.recipe-photo-grid-select').first().focus();
    await page.keyboard.press('Control+ArrowRight');
    await expect
      .poll(() =>
        photoDialog
          .locator('.recipe-photo-grid-item')
          .evaluateAll((items) => items.map((item) => item.getAttribute('data-photo-id'))),
      )
      .toEqual([
        initialOrder[1],
        initialOrder[0],
        initialOrder[2],
        initialOrder[3],
        initialOrder[4],
        initialOrder[5],
        expect.any(String),
      ]);
    await expect(movedPhotoButton).toBeFocused();
    await expect(movedPhotoButton).toBeEnabled();
    await page.keyboard.press('Control+ArrowRight');
    await expect
      .poll(() =>
        photoDialog
          .locator('.recipe-photo-grid-item')
          .evaluateAll((items) => items.map((item) => item.getAttribute('data-photo-id'))),
      )
      .toEqual([
        initialOrder[1],
        initialOrder[2],
        initialOrder[0],
        initialOrder[3],
        initialOrder[4],
        initialOrder[5],
        expect.any(String),
      ]);
    await expect(movedPhotoButton).toBeFocused();
    const columns = await photoDialog.locator('.recipe-photo-grid').evaluate((grid) => {
      const styles = getComputedStyle(grid);
      return {
        columns: styles.gridTemplateColumns.split(' ').length,
        rowGap: Number.parseFloat(styles.rowGap),
      };
    });
    expect(columns.rowGap).toBeGreaterThanOrEqual(21);
    await expect(photoDialog.locator('.recipe-photo-grid-select').first()).toBeEnabled();
    const beforeVerticalMove = await photoDialog
      .locator('.recipe-photo-grid-item')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-photo-id')));
    await photoDialog.locator('.recipe-photo-grid-select').first().focus();
    await page.keyboard.press('Control+ArrowDown');
    const expectedVerticalOrder = [...beforeVerticalMove];
    const [defaultPhoto] = expectedVerticalOrder.splice(0, 1);
    expectedVerticalOrder.splice(columns.columns, 0, defaultPhoto);
    await expect
      .poll(() =>
        photoDialog
          .locator('.recipe-photo-grid-item')
          .evaluateAll((items) => items.map((item) => item.getAttribute('data-photo-id'))),
      )
      .toEqual(expectedVerticalOrder);
    await expect(photoDialog.locator('.media-manager-status:visible')).toHaveText(
      'Photo order updated.',
    );
    const reorderedAssets = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=id,position,is_primary&recipe_id=eq.${recipeId}&status=eq.ready&order=position.asc`,
      { headers },
    );
    expect(reorderedAssets.ok(), await reorderedAssets.text()).toBeTruthy();
    const persistedOrder = (await reorderedAssets.json()) as {
      id: string;
      position: number;
      is_primary: boolean;
    }[];
    expect(
      persistedOrder.filter((asset) => asset.is_primary).map((asset) => asset.id),
      JSON.stringify({ beforeVerticalMove, expectedVerticalOrder, persistedOrder }),
    ).toEqual([expectedVerticalOrder[0]]);
    await expect
      .poll(() =>
        photoDialog
          .locator('.recipe-photo-grid-item')
          .evaluateAll((items) => items.map((item) => item.getAttribute('data-photo-id'))),
      )
      .toEqual(persistedOrder.map((asset) => asset.id));
    await expect(photoDialog.locator('.recipe-photo-grid-item').first()).toHaveClass(/is-default/);

    async function dragPhoto(sourceIndex: number, targetIndex: number, monitorRelease = false) {
      const photoButtons = photoDialog.locator('.recipe-photo-grid-select');
      const source = await photoButtons.nth(sourceIndex).boundingBox();
      const target = await photoButtons.nth(targetIndex).boundingBox();
      const photoId = await photoDialog
        .locator('.recipe-photo-grid-item')
        .nth(sourceIndex)
        .getAttribute('data-photo-id');
      if (!source || !target || !photoId) {
        throw new Error('Recipe photo drag targets must be visible.');
      }
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(source.x + source.width / 2 + 16, source.y + source.height / 2 + 12, {
        steps: 3,
      });
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
        steps: 6,
      });
      if (monitorRelease) {
        await page.evaluate((id) => {
          window.__recipePhotoDragSamples = [];
          const stopAt = performance.now() + 320;
          const sample = () => {
            const item = document.querySelector<HTMLElement>(`[data-photo-id="${id}"]`);
            const rect = item?.getBoundingClientRect();
            if (rect) {
              window.__recipePhotoDragSamples?.push({
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
              });
            }
            if (performance.now() < stopAt) {
              requestAnimationFrame(sample);
            }
          };
          requestAnimationFrame(sample);
        }, photoId);
      }
      await page.mouse.up();
    }

    async function dragPhotoTo(targetIndex: number) {
      await dragPhoto(0, targetIndex);
    }

    const beforeHorizontalDrag = await photoDialog
      .locator('.recipe-photo-grid-item')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-photo-id')));
    const expectedHorizontalDrag = [...beforeHorizontalDrag];
    const [horizontalPhoto] = expectedHorizontalDrag.splice(0, 1);
    expectedHorizontalDrag.splice(1, 0, horizontalPhoto);
    const orderPath = `/api/media/recipes/${recipeId}/order`;
    const orderRoute = `**${orderPath}`;
    let releaseOrderRequest!: () => void;
    const orderGate = new Promise<void>((resolve) => {
      releaseOrderRequest = resolve;
    });
    await page.route(
      orderRoute,
      async (route) => {
        await orderGate;
        await route.continue();
      },
      { times: 1 },
    );
    const pendingOrderRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === orderPath,
    );
    const pendingOrderResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === orderPath,
    );
    try {
      await dragPhotoTo(1);
      await pendingOrderRequest;
      await expect
        .poll(() =>
          photoDialog
            .locator('.recipe-photo-grid-item')
            .evaluateAll((items) => items.map((item) => item.getAttribute('data-photo-id'))),
        )
        .toEqual(expectedHorizontalDrag);
      await expect(photoDialog.locator('.media-manager-status:visible')).toHaveText(
        'Saving image changes…',
      );
    } finally {
      releaseOrderRequest();
    }
    await pendingOrderResponse;
    await expect
      .poll(() =>
        photoDialog
          .locator('.recipe-photo-grid-item')
          .evaluateAll((items) => items.map((item) => item.getAttribute('data-photo-id'))),
      )
      .toEqual(expectedHorizontalDrag);
    await page.unroute(orderRoute);

    await dragPhotoTo(columns.columns);
    const expectedVerticalDrag = [...expectedHorizontalDrag];
    const [verticalPhoto] = expectedVerticalDrag.splice(0, 1);
    expectedVerticalDrag.splice(columns.columns, 0, verticalPhoto);
    await expect
      .poll(() =>
        photoDialog
          .locator('.recipe-photo-grid-item')
          .evaluateAll((items) => items.map((item) => item.getAttribute('data-photo-id'))),
      )
      .toEqual(expectedVerticalDrag);
    await expect(photoDialog.locator('.media-manager-status:visible')).toHaveText(
      'Photo order updated.',
    );

    async function expectDropNotToOvershoot(
      sourceIndex: number,
      targetIndex: number,
      axis: 'x' | 'y',
    ) {
      const currentOrder = await photoDialog
        .locator('.recipe-photo-grid-item')
        .evaluateAll((items) => items.map((item) => item.getAttribute('data-photo-id')));
      const expectedOrder = [...currentOrder];
      const [draggedPhoto] = expectedOrder.splice(sourceIndex, 1);
      expectedOrder.splice(targetIndex, 0, draggedPhoto);
      const target = await photoDialog
        .locator('.recipe-photo-grid-item')
        .nth(targetIndex)
        .boundingBox();
      if (!target) {
        throw new Error('Recipe photo drop target must be visible.');
      }

      await dragPhoto(sourceIndex, targetIndex, true);
      await page.waitForTimeout(260);
      const samples = await page.evaluate(() => {
        return window.__recipePhotoDragSamples ?? [];
      });
      const values = samples.map((sample) => sample[axis]);
      expect(values.length).toBeGreaterThan(5);
      const minimum = Math.min(...values);
      const targetCenter =
        axis === 'x' ? target.x + target.width / 2 : target.y + target.height / 2;
      expect(
        minimum,
        JSON.stringify({ axis, targetCenter, minimum, samples }),
      ).toBeGreaterThanOrEqual(targetCenter - 1);
      await expect
        .poll(() =>
          photoDialog
            .locator('.recipe-photo-grid-item')
            .evaluateAll((items) => items.map((item) => item.getAttribute('data-photo-id'))),
        )
        .toEqual(expectedOrder);
      await expect(photoDialog.locator('.media-manager-status:visible')).toHaveText(
        'Photo order updated.',
      );
    }

    await expectDropNotToOvershoot(1, 0, 'x');
    await expectDropNotToOvershoot(columns.columns, 0, 'y');

    const photoAxe = await new AxeBuilder({ page }).analyze();
    expect(photoAxe.violations).toEqual([]);
    await photoDialog.getByRole('button', { name: 'Done' }).click();

    await page.goto(`/recipes/${recipeId}`);
    await expect(page.locator('.recipe-photo-gallery')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Recipe photos' })).toBeVisible();
    const featureImage = page.locator('.recipe-photo-feature-image');
    await expect(featureImage).toBeVisible();
    const imageMaxHeight = viewportWidth <= 640 ? 144 : viewportWidth <= 760 ? 240 : null;
    const [featureImageBounds, featureBounds] = await Promise.all([
      featureImage.boundingBox(),
      page.locator('.recipe-photo-feature').boundingBox(),
    ]);
    expect(featureImageBounds).not.toBeNull();
    expect(featureBounds).not.toBeNull();
    expect(
      Math.abs(
        (featureImageBounds?.x ?? 0) +
          (featureImageBounds?.width ?? 0) / 2 -
          ((featureBounds?.x ?? 0) + (featureBounds?.width ?? 0) / 2),
      ),
    ).toBeLessThanOrEqual(1);
    const thumbnailsBounds = await page.locator('.recipe-photo-thumbnails').boundingBox();
    expect(thumbnailsBounds).not.toBeNull();
    if (!featureBounds || !thumbnailsBounds) {
      throw new Error('Expected recipe photo thumbnails beneath the feature image');
    }
    expect(thumbnailsBounds.y).toBeGreaterThanOrEqual(featureBounds.y + featureBounds.height);
    const thumbnailRows = await page.locator('.recipe-photo-thumbnails').evaluate((list) => {
      const rows = new Map<number, { left: number; right: number; count: number }>();
      for (const image of Array.from(list.querySelectorAll('.framed-media-image'))) {
        const bounds = image.getBoundingClientRect();
        const rowTop = Math.round(bounds.top);
        const row = rows.get(rowTop) ?? { left: bounds.left, right: bounds.right, count: 0 };
        row.left = Math.min(row.left, bounds.left);
        row.right = Math.max(row.right, bounds.right);
        row.count += 1;
        rows.set(rowTop, row);
      }
      return [...rows.values()].map(({ left, right, count }) => ({
        center: (left + right) / 2,
        count,
      }));
    });
    const thumbnailCapacity = await page.locator('.recipe-photo-thumbnails').evaluate((list) => {
      const firstButton = list.querySelector('button');
      if (!firstButton) return 0;
      const styles = getComputedStyle(list);
      const gap = Number.parseFloat(styles.columnGap) || 0;
      const itemWidth = firstButton.getBoundingClientRect().width;
      return Math.floor((list.clientWidth + gap) / (itemWidth + gap));
    });
    const expectedThumbnailRows = Array.from(
      { length: Math.ceil(7 / thumbnailCapacity) },
      (_, index) => Math.min(thumbnailCapacity, 7 - index * thumbnailCapacity),
    );
    expect(thumbnailRows.map(({ count }) => count)).toEqual(expectedThumbnailRows);
    const thumbnailButtons = page.locator('.recipe-photo-thumbnails').getByRole('button');
    await expect(thumbnailButtons).toHaveCount(7);
    const originalThumbnailOrder = await thumbnailButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('data-photo-id')),
    );
    const initialFeaturedPhotoId = await featureImage.getAttribute('data-photo-id');
    const selectedThumbnail = page.getByRole('button', { name: 'Show photo 2' });
    const selectedPhotoId = await selectedThumbnail.getAttribute('data-photo-id');
    expect(selectedPhotoId).not.toBe(initialFeaturedPhotoId);
    const imageViewer = page.locator('.image-viewer-dialog');
    await expect(imageViewer).toHaveJSProperty('open', false);
    await selectedThumbnail.click();
    await expect(imageViewer).toHaveJSProperty('open', false);
    await expect(featureImage).toHaveAttribute('data-photo-id', selectedPhotoId ?? '');
    await expect(selectedThumbnail).toHaveAttribute('aria-pressed', 'true');
    await expect(thumbnailButtons).toHaveCount(7);
    await featureImage.click();
    await expect(imageViewer).toHaveJSProperty('open', true);
    const fullSizeImage = imageViewer.locator('.image-viewer-full-image');
    await expect(fullSizeImage).toBeVisible();
    await fullSizeImage.click();
    await expect(imageViewer).toHaveJSProperty('open', true);
    const fullSizeBounds = await fullSizeImage.evaluate((image: SVGSVGElement) => ({
      rect: image.getBoundingClientRect().toJSON(),
    }));
    expect(fullSizeBounds.rect.width).toBeLessThanOrEqual(viewportWidth);
    expect(fullSizeBounds.rect.height).toBeLessThanOrEqual(page.viewportSize()?.height ?? Infinity);
    expect(fullSizeBounds.rect.right).toBeLessThanOrEqual(viewportWidth + 1);
    expect(fullSizeBounds.rect.bottom).toBeLessThanOrEqual(
      (page.viewportSize()?.height ?? Infinity) + 1,
    );
    await imageViewer.getByRole('button', { name: 'Close image viewer' }).click();
    await expect(imageViewer).toHaveJSProperty('open', false);
    await featureImage.click();
    await expect(imageViewer).toHaveJSProperty('open', true);
    await page.keyboard.press('Escape');
    await expect(imageViewer).toHaveJSProperty('open', false);
    await featureImage.click();
    await expect(imageViewer).toHaveJSProperty('open', true);
    await imageViewer.locator('.image-viewer-stage').click({ position: { x: 1, y: 120 } });
    await expect(imageViewer).toHaveJSProperty('open', false);
    expect(
      await thumbnailButtons.evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute('data-photo-id')),
      ),
    ).toEqual(originalThumbnailOrder);
    const originalThumbnail = page.getByRole('button', { name: 'Show photo 1' });
    await originalThumbnail.focus();
    await originalThumbnail.press('Space');
    await expect(featureImage).toHaveAttribute('data-photo-id', initialFeaturedPhotoId ?? '');
    await selectedThumbnail.focus();
    await selectedThumbnail.press('Enter');
    await expect(featureImage).toHaveAttribute('data-photo-id', selectedPhotoId ?? '');
    await page.reload();
    await expect(featureImage).toHaveAttribute('data-photo-id', initialFeaturedPhotoId ?? '');
    await expect(page.getByRole('button', { name: 'Show photo 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      await page
        .locator('.recipe-photo-thumbnails')
        .getByRole('button')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-photo-id'))),
    ).toEqual(originalThumbnailOrder);
    expect(thumbnailsBounds.width).toBeLessThanOrEqual(280);
    expect(
      Math.abs((thumbnailRows[0]?.center ?? 0) - (thumbnailRows[1]?.center ?? 0)),
    ).toBeLessThanOrEqual(1);
    expect(featureImageBounds?.width ?? Infinity).toBeLessThanOrEqual(280);
    if (viewportWidth > 760) {
      const metadataBounds = await page
        .getByRole('heading', { name: 'Recipe details' })
        .boundingBox();
      const actionBounds = await page.locator('.recipe-detail-heading-actions').boundingBox();
      const tagsRowBounds = await page.locator('.recipe-detail-tags-row').boundingBox();
      expect(metadataBounds).not.toBeNull();
      expect(actionBounds).not.toBeNull();
      expect(tagsRowBounds).not.toBeNull();
      if (!metadataBounds || !featureBounds || !actionBounds || !tagsRowBounds) {
        throw new Error('Expected desktop recipe summary and title controls to be visible');
      }
      await expect(featureImage).toHaveCSS('max-height', '280px');
      expect((await featureImage.boundingBox())?.height ?? Infinity).toBeLessThanOrEqual(281);
      expect(featureBounds.x + featureBounds.width).toBeLessThan(metadataBounds.x);
      expect(Math.abs((featureImageBounds?.y ?? 0) - metadataBounds.y)).toBeLessThanOrEqual(4);
      expect(actionBounds.y).toBeGreaterThanOrEqual(tagsRowBounds.y);
      expect(actionBounds.y + actionBounds.height).toBeLessThanOrEqual(
        tagsRowBounds.y + tagsRowBounds.height,
      );
      await expect(page.locator('main.recipes-main')).toHaveCSS('padding-top', '17px');
    } else {
      if (imageMaxHeight === null) {
        throw new Error('Expected a responsive image cap below the desktop breakpoint');
      }
      await expect(featureImage).toHaveCSS('max-height', `${imageMaxHeight}px`);
      expect((await featureImage.boundingBox())?.height ?? Infinity).toBeLessThanOrEqual(
        imageMaxHeight,
      );
      const metadataBounds = await page
        .getByRole('heading', { name: 'Recipe details' })
        .boundingBox();
      const galleryBounds = await page.locator('.recipe-photo-gallery').boundingBox();
      expect(metadataBounds).not.toBeNull();
      expect(galleryBounds).not.toBeNull();
      if (!metadataBounds || !galleryBounds) {
        throw new Error('Expected the stacked mobile recipe summary to be visible');
      }
      expect(metadataBounds.y).toBeGreaterThanOrEqual(galleryBounds.y + galleryBounds.height);
    }
    const detailAxe = await new AxeBuilder({ page }).analyze();
    expect(detailAxe.violations).toEqual([]);

    await page.goto(`/recipes/${recipeId}/edit`);
    await page.getByRole('button', { name: 'Manage recipe photos' }).click();
    const editPhotoDialog = page.getByRole('dialog', { name: 'Manage recipe photos' });
    await editPhotoDialog.getByRole('button', { name: 'Remove photo 1' }).click();
    await expect(editPhotoDialog.locator('.recipe-photo-grid-item')).toHaveCount(6);
    for (const expectedCount of [5, 4, 3, 2]) {
      await editPhotoDialog.getByRole('button', { name: 'Remove photo 1' }).click();
      await expect(editPhotoDialog.locator('.recipe-photo-grid-item')).toHaveCount(expectedCount);
    }
    await editPhotoDialog.getByRole('button', { name: 'Done' }).click();
    await page.goto(`/recipes/${recipeId}`);
    const compactGallery = page.locator('.recipe-photo-gallery');
    const compactImage = page.locator('.recipe-photo-feature-image');
    const compactThumbnails = page.locator('.recipe-photo-thumbnails');
    await expect(compactThumbnails.locator('.framed-media-image')).toHaveCount(2);
    const [compactGalleryBounds, compactImageBounds, compactThumbnailBounds] = await Promise.all([
      compactGallery.boundingBox(),
      compactImage.boundingBox(),
      compactThumbnails.boundingBox(),
    ]);
    expect(compactGalleryBounds).not.toBeNull();
    expect(compactImageBounds).not.toBeNull();
    expect(compactThumbnailBounds).not.toBeNull();
    if (!compactGalleryBounds || !compactImageBounds || !compactThumbnailBounds) {
      throw new Error('Expected the compact two-photo gallery to be visible');
    }
    expect(compactGalleryBounds.width).toBeCloseTo(
      Math.max(compactImageBounds.width, compactThumbnailBounds.width),
      0,
    );
    expect(
      Math.abs(
        compactThumbnailBounds.x +
          compactThumbnailBounds.width / 2 -
          (compactGalleryBounds.x + compactGalleryBounds.width / 2),
      ),
    ).toBeLessThanOrEqual(1);

    await page.goto(`/recipes/${recipeId}/edit`);
    await page.getByRole('button', { name: 'Manage recipe photos' }).click();
    const singlePhotoDialog = page.getByRole('dialog', { name: 'Manage recipe photos' });
    await singlePhotoDialog.getByRole('button', { name: 'Remove photo 1' }).click();
    await expect(singlePhotoDialog.locator('.recipe-photo-grid-item')).toHaveCount(1);
    await singlePhotoDialog.getByRole('button', { name: 'Done' }).click();
    await page.goto(`/recipes/${recipeId}`);
    const singlePhotoGallery = page.locator('.recipe-photo-gallery');
    const singlePhotoImage = page.locator('.recipe-photo-feature-image');
    await expect(singlePhotoGallery).toBeVisible();
    await expect(page.locator('.recipe-photo-thumbnails')).toHaveCount(0);
    const [singlePhotoGalleryBounds, singlePhotoImageBounds] = await Promise.all([
      singlePhotoGallery.boundingBox(),
      singlePhotoImage.boundingBox(),
    ]);
    expect(singlePhotoGalleryBounds).not.toBeNull();
    expect(singlePhotoImageBounds).not.toBeNull();
    if (!singlePhotoGalleryBounds || !singlePhotoImageBounds) {
      throw new Error('Expected a centered single-photo gallery');
    }
    expect(
      Math.abs(
        singlePhotoImageBounds.x +
          singlePhotoImageBounds.width / 2 -
          (singlePhotoGalleryBounds.x + singlePhotoGalleryBounds.width / 2),
      ),
    ).toBeLessThanOrEqual(1);

    await page.goto(`/publications/${publicationId}`);
    await page.getByRole('button', { name: 'Edit publication' }).click();
    await page.getByRole('button', { name: `Manage ${publicationName} cover` }).click();
    const finalCoverDialog = page.getByRole('dialog', { name: 'Manage publication cover' });
    await finalCoverDialog.getByRole('button', { name: 'Remove cover image' }).click();
    await finalCoverDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      page.locator('.publication-edit-cover .publication-cover-manager-image'),
    ).toBeVisible();
    await page.getByRole('button', { name: `Manage ${publicationName} cover` }).click();
    await finalCoverDialog.getByRole('button', { name: 'Remove cover image' }).click();
    await finalCoverDialog.getByRole('button', { name: 'Submit' }).click();
    await expect(
      page.locator(
        '.publication-edit-cover .publication-cover-manager-trigger .publication-cover-fallback',
      ),
    ).toBeVisible();
    await expect(
      page.locator('.publication-detail-heading .publication-cover-fallback').first(),
    ).toBeVisible();
  } finally {
    await deleteTestUser(request, otherOwner);
    await deleteTestUser(request, owner);
  }
});

test('media reservations and metadata are isolated to their owner @e2e', async ({ request }) => {
  const owner = await createTestUser(request);
  const otherOwner = await createTestUser(request);
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();
  const ownerHeadersValue = ownerHeaders(anonKey, owner.accessToken);
  const otherHeaders = ownerHeaders(anonKey, otherOwner.accessToken);
  const publicationId = await createBook(
    request,
    apiUrl,
    ownerHeadersValue,
    `Private Media ${randomUUID()}`,
  );

  try {
    const unauthenticated = await request.post('/api/media/uploads', {
      data: { parentType: 'publication', parentId: publicationId, kind: 'publication_cover' },
    });
    expect(unauthenticated.status()).toBe(401);

    const foreignReservation = await request.post(`${apiUrl}/rest/v1/rpc/reserve_media_upload`, {
      headers: otherHeaders,
      data: {
        p_parent_type: 'publication',
        p_parent_id: publicationId,
      },
    });
    expect(foreignReservation.ok()).toBe(false);

    const ownerReservation = await request.post(`${apiUrl}/rest/v1/rpc/reserve_media_upload`, {
      headers: ownerHeadersValue,
      data: {
        p_parent_type: 'publication',
        p_parent_id: publicationId,
      },
    });
    expect(ownerReservation.ok()).toBe(true);
    const assetId = (await ownerReservation.json()) as string;
    const foreignRead = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=id&id=eq.${assetId}`,
      { headers: otherHeaders },
    );
    expect(foreignRead.ok()).toBe(true);
    expect(await foreignRead.json()).toEqual([]);
  } finally {
    await deleteTestUser(request, otherOwner);
    await deleteTestUser(request, owner);
  }
});

test('concurrent media reservations and finalization enforce count and account quotas @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const { apiUrl, anonKey, serviceRoleKey } = await getLocalSupabaseConfig();
  const headers = ownerHeaders(anonKey, owner.accessToken);
  const service = serviceHeaders(serviceRoleKey);
  const photoRecipeId = await createRecipe(request, apiUrl, headers, `Photo limit ${randomUUID()}`);
  const quotaRecipeA = await createRecipe(request, apiUrl, headers, `Quota A ${randomUUID()}`);
  const quotaRecipeB = await createRecipe(request, apiUrl, headers, `Quota B ${randomUUID()}`);

  try {
    for (let uploaded = 0; uploaded < MAX_RECIPE_PHOTOS; uploaded += 5) {
      const batchSize = Math.min(5, MAX_RECIPE_PHOTOS - uploaded);
      const reservations = await Promise.all(
        Array.from({ length: batchSize }, () =>
          request.post(`${apiUrl}/rest/v1/rpc/reserve_media_upload`, {
            headers,
            data: { p_parent_type: 'recipe', p_parent_id: photoRecipeId },
          }),
        ),
      );
      expect(reservations.every((response) => response.ok())).toBe(true);
      const assetIds = await Promise.all(reservations.map((response) => response.json()));
      const completions = await Promise.all(
        assetIds.map((assetId) =>
          request.post(`${apiUrl}/rest/v1/rpc/complete_media_upload`, {
            headers: service,
            data: {
              p_asset_id: assetId,
              p_width: 100,
              p_height: 100,
              p_byte_size: 1,
              p_description: '',
            },
          }),
        ),
      );
      expect(completions.every((response) => response.ok())).toBe(true);
    }

    const overLimitReservation = await request.post(`${apiUrl}/rest/v1/rpc/reserve_media_upload`, {
      headers,
      data: { p_parent_type: 'recipe', p_parent_id: photoRecipeId },
    });
    expect(overLimitReservation.ok()).toBe(false);

    const quotaReservations = await Promise.all(
      [quotaRecipeA, quotaRecipeB].map((recipeId) =>
        request.post(`${apiUrl}/rest/v1/rpc/reserve_media_upload`, {
          headers,
          data: { p_parent_type: 'recipe', p_parent_id: recipeId },
        }),
      ),
    );
    expect(quotaReservations.every((response) => response.ok())).toBe(true);
    const quotaAssetIds = await Promise.all(quotaReservations.map((response) => response.json()));
    const completions = await Promise.all(
      quotaAssetIds.map((assetId) =>
        request.post(`${apiUrl}/rest/v1/rpc/complete_media_upload`, {
          headers: service,
          data: {
            p_asset_id: assetId,
            p_width: 100,
            p_height: 100,
            p_byte_size: 600 * 1024 * 1024,
            p_description: '',
          },
        }),
      ),
    );
    expect(completions.filter((response) => response.ok())).toHaveLength(1);
    expect(completions.filter((response) => !response.ok())).toHaveLength(1);
  } finally {
    await deleteMediaFixtures(request, apiUrl, serviceRoleKey, owner.id);
    await deleteTestUser(request, owner);
  }
});

test('media cleanup requires authorization and drains queued missing objects @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const { apiUrl, serviceRoleKey } = await getLocalSupabaseConfig();
  const service = serviceHeaders(serviceRoleKey);
  const missingPath = `${owner.id}/assets/${randomUUID()}/missing.webp`;
  let queueId: number | null = null;

  try {
    const queued = await request.post(`${apiUrl}/rest/v1/media_deletion_queue`, {
      headers: { ...service, Prefer: 'return=representation' },
      data: { account_id: owner.id, object_path: missingPath },
    });
    expect(queued.ok(), await queued.text()).toBeTruthy();
    const [queueEntry] = (await queued.json()) as { id: number }[];
    queueId = queueEntry.id;

    const unauthorized = await request.get('/api/cron/media-cleanup');
    expect(unauthorized.status()).toBe(401);

    const cleanup = await request.get('/api/cron/media-cleanup', {
      headers: { Authorization: 'Bearer slice12-local-test-only' },
    });
    expect(cleanup.ok(), await cleanup.text()).toBeTruthy();
    const cleanupResult = (await cleanup.json()) as { processed: number; failed: number };
    expect(cleanupResult.failed).toBe(0);
    expect(cleanupResult.processed).toBeGreaterThanOrEqual(1);

    const remaining = await request.get(
      `${apiUrl}/rest/v1/media_deletion_queue?select=id&id=eq.${queueId}`,
      { headers: service },
    );
    expect(remaining.ok(), await remaining.text()).toBeTruthy();
    expect(await remaining.json()).toEqual([]);
  } finally {
    if (queueId !== null) {
      const cleanup = await request.delete(
        `${apiUrl}/rest/v1/media_deletion_queue?id=eq.${queueId}`,
        { headers: service },
      );
      expect(cleanup.ok(), await cleanup.text()).toBeTruthy();
    }
    await deleteTestUser(request, owner);
  }
});

test('recipe media stays hidden in Trash and purge queues objects without retaining history @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const { apiUrl, anonKey, serviceRoleKey } = await getLocalSupabaseConfig();
  const ownerAuth = ownerHeaders(anonKey, owner.accessToken);
  const service = serviceHeaders(serviceRoleKey);
  const recipeId = await createRecipe(
    request,
    apiUrl,
    ownerAuth,
    `Media lifecycle ${randomUUID()}`,
  );
  let assetId: string | null = null;

  try {
    const reservation = await request.post(`${apiUrl}/rest/v1/rpc/reserve_media_upload`, {
      headers: ownerAuth,
      data: { p_parent_type: 'recipe', p_parent_id: recipeId },
    });
    expect(reservation.ok(), await reservation.text()).toBeTruthy();
    assetId = await reservation.json();

    const completion = await request.post(`${apiUrl}/rest/v1/rpc/complete_media_upload`, {
      headers: service,
      data: {
        p_asset_id: assetId,
        p_width: 100,
        p_height: 100,
        p_byte_size: 100,
        p_description: '',
      },
    });
    expect(completion.ok(), await completion.text()).toBeTruthy();

    const trash = await request.post(`${apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerAuth,
      data: { p_recipe_id: recipeId, p_expected_version: 1 },
    });
    expect(trash.ok(), await trash.text()).toBeTruthy();
    const hiddenMedia = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=id&recipe_id=eq.${recipeId}`,
      { headers: ownerAuth },
    );
    expect(await hiddenMedia.json()).toEqual([]);

    const restore = await request.post(`${apiUrl}/rest/v1/rpc/restore_recipe`, {
      headers: ownerAuth,
      data: { p_recipe_id: recipeId, p_expected_version: 2 },
    });
    expect(restore.ok(), await restore.text()).toBeTruthy();
    const restoredMedia = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=id&recipe_id=eq.${recipeId}`,
      { headers: ownerAuth },
    );
    expect(await restoredMedia.json()).toEqual([{ id: assetId }]);

    const secondTrash = await request.post(`${apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerAuth,
      data: { p_recipe_id: recipeId, p_expected_version: 3 },
    });
    expect(secondTrash.ok(), await secondTrash.text()).toBeTruthy();

    const fullPath = `${owner.id}/assets/${assetId}/full.webp`;
    const thumbnailPath = `${owner.id}/assets/${assetId}/thumb.webp`;
    runLocalSql(`
      do $media_purge_test$
      begin
        begin
          perform set_config('app.recipe_lifecycle_context', 'on', true);
          update public.recipes
          set trashed_at = '2000-01-01T00:00:00Z',
              trashed_by_user_id = '${owner.id}'::uuid
          where id = '${recipeId}'::uuid;
          perform public.purge_expired_recipes('2001-01-01T00:00:00Z'::timestamptz);

          if exists (select 1 from public.recipes where id = '${recipeId}'::uuid) then
            raise exception 'purged recipe row remains';
          end if;
          if exists (
            select 1 from public.recipe_history where record_id = '${recipeId}'::uuid
          ) then
            raise exception 'purged recipe history remains';
          end if;
          if not exists (
            select 1 from public.media_deletion_queue where object_path = '${fullPath}'
          ) or not exists (
            select 1 from public.media_deletion_queue where object_path = '${thumbnailPath}'
          ) then
            raise exception 'purged recipe media paths were not queued';
          end if;

          raise exception 'rollback media purge test';
        exception
          when others then
            if sqlerrm <> 'rollback media purge test' then
              raise;
            end if;
        end;
      end;
      $media_purge_test$;
    `);
  } finally {
    await deleteMediaFixtures(request, apiUrl, serviceRoleKey, owner.id);
    await deleteTestUser(request, owner);
  }
});

test('publication covers remain hidden in Trash and purge queues objects without history @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const { apiUrl, anonKey, serviceRoleKey } = await getLocalSupabaseConfig();
  const ownerAuth = ownerHeaders(anonKey, owner.accessToken);
  const service = serviceHeaders(serviceRoleKey);
  const publicationId = await createBook(
    request,
    apiUrl,
    ownerAuth,
    `Cover lifecycle ${randomUUID()}`,
  );
  let assetId: string | null = null;

  try {
    const reservation = await request.post(`${apiUrl}/rest/v1/rpc/reserve_media_upload`, {
      headers: ownerAuth,
      data: { p_parent_type: 'publication', p_parent_id: publicationId },
    });
    expect(reservation.ok(), await reservation.text()).toBeTruthy();
    assetId = await reservation.json();

    const completion = await request.post(`${apiUrl}/rest/v1/rpc/complete_media_upload`, {
      headers: service,
      data: {
        p_asset_id: assetId,
        p_width: 100,
        p_height: 100,
        p_byte_size: 100,
        p_description: '',
      },
    });
    expect(completion.ok(), await completion.text()).toBeTruthy();

    const trash = await request.post(`${apiUrl}/rest/v1/rpc/trash_publication`, {
      headers: ownerAuth,
      data: {
        p_publication_id: publicationId,
        p_expected_version: 1,
        p_recipe_disposition: 'delete',
        p_destination_publication_id: null,
      },
    });
    expect(trash.ok(), await trash.text()).toBeTruthy();
    const hiddenCover = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=id&publication_id=eq.${publicationId}`,
      { headers: ownerAuth },
    );
    expect(await hiddenCover.json()).toEqual([]);

    const fullPath = `${owner.id}/assets/${assetId}/full.webp`;
    const thumbnailPath = `${owner.id}/assets/${assetId}/thumb.webp`;
    runLocalSql(`
      do $publication_media_purge_test$
      begin
        begin
          perform set_config('app.publication_lifecycle_context', 'on', true);
          update public.publications
          set trashed_at = '2000-01-01T00:00:00Z',
              trashed_by_user_id = '${owner.id}'::uuid
          where id = '${publicationId}'::uuid;
          perform public.purge_expired_publications('2001-01-01T00:00:00Z'::timestamptz);

          if exists (select 1 from public.publications where id = '${publicationId}'::uuid) then
            raise exception 'purged publication row remains';
          end if;
          if exists (
            select 1 from public.publication_history where record_id = '${publicationId}'::uuid
          ) then
            raise exception 'purged publication history remains';
          end if;
          if not exists (
            select 1 from public.media_deletion_queue where object_path = '${fullPath}'
          ) or not exists (
            select 1 from public.media_deletion_queue where object_path = '${thumbnailPath}'
          ) then
            raise exception 'purged publication media paths were not queued';
          end if;

          raise exception 'rollback publication media purge test';
        exception
          when others then
            if sqlerrm <> 'rollback publication media purge test' then
              raise;
            end if;
        end;
      end;
      $publication_media_purge_test$;
    `);
  } finally {
    await deleteMediaFixtures(request, apiUrl, serviceRoleKey, owner.id);
    await deleteTestUser(request, owner);
  }
});
