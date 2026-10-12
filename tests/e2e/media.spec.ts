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
  execFileSync('supabase', ['db', 'query', '--local', '--output-format', 'json', sql], {
    encoding: 'utf8',
  });
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
  await expect(page).toHaveURL(/\/recipes$/);
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
      p_instruction_steps: [],
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

test('image management panes stage covers and immediately manage decorative recipe photos @e2e @a11y', async ({
  page,
  request,
}) => {
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
    const viewportWidth = page.viewportSize()?.width ?? 1280;
    await coverDialog.evaluate((dialog) => {
      dialog
        .querySelector<HTMLInputElement>('input[aria-label="Choose cover image"]')
        ?.dispatchEvent(new Event('cancel', { bubbles: true }));
    });
    await expect(coverDialog).toBeVisible();
    if (viewportWidth <= 640) {
      await expect(coverDialog.locator('.media-camera-picker')).toBeVisible();
      await coverDialog.evaluate((dialog) => {
        dialog
          .querySelector<HTMLInputElement>('input[aria-label="Take cover photo"]')
          ?.dispatchEvent(new Event('cancel', { bubbles: true }));
      });
      await expect(coverDialog).toBeVisible();
    } else {
      await expect(coverDialog.locator('.media-camera-picker')).not.toBeVisible();
    }
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

    await page.getByRole('button', { name: `Manage ${publicationName} cover` }).click();
    await coverDialog.locator('input[aria-label="Choose cover image"]').setInputFiles({
      name: 'cover.png',
      mimeType: 'image/png',
      buffer: imageBuffer,
    });
    await expect(coverDialog.locator('.publication-cover-editor-image')).toBeVisible();
    await coverDialog.getByRole('button', { name: 'Submit' }).click();
    await expect(coverDialog).not.toBeVisible();
    await expect(
      page.locator('.publication-edit-cover .publication-cover-manager-image'),
    ).toBeVisible();
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
    await expect(page.locator('.recipe-photo-manager-trigger img')).toHaveCount(0);
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
      const pasteTarget = photoDialog.getByRole('textbox', { name: 'Paste an image here' });
      await expect(pasteTarget).toHaveAttribute(
        'placeholder',
        'Tap and hold here, then choose Paste.',
      );
      await expect(pasteTarget).toHaveAttribute('tabindex', '-1');
      await page.keyboard.press('Tab');
      await expect(pasteTarget).not.toBeFocused();
      await pasteTarget.click();
      await expect(pasteTarget).toBeFocused();
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
    await expect(page.locator('.recipe-photo-manager-trigger img')).toBeVisible();
    await expect(page.locator('.recipe-photo-manager-trigger img')).toHaveCSS(
      'object-fit',
      'contain',
    );
    await expect(page.locator('.recipe-photo-manager-pencil')).toBeVisible();
    const triggerPhotoSource = await page
      .locator('.recipe-photo-manager-trigger img')
      .getAttribute('src');
    const primaryGridPhotoSource = await photoDialog
      .locator('.recipe-photo-grid-item.is-default .recipe-photo-grid-image')
      .getAttribute('src');
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
    await page.evaluate((encodedImage) => {
      const bytes = Uint8Array.from(atob(encodedImage), (character) => character.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'pasted-photo.png', { type: 'image/png' }));
      document
        .querySelector('.media-manager-dialog')
        ?.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: transfer }));
    }, imageBuffer.toString('base64'));
    await expect(photoDialog.locator('.recipe-photo-grid-item')).toHaveCount(7);
    await expect(photoDialog.locator('.recipe-photo-add-tile')).toBeVisible();
    const photoStatus = photoDialog.locator('.media-manager-status:visible');
    await expect(photoStatus).toBeVisible();
    const photoActions = await Promise.all([
      photoDialog.locator('.media-manager-photo-meta').boundingBox(),
      photoDialog.locator('.media-manager-dialog-footer button').boundingBox(),
      photoDialog.locator('.recipe-photo-add-tile').boundingBox(),
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
    const featureImage = page.locator('.recipe-photo-feature-image');
    await expect(featureImage).toBeVisible();
    await expect(featureImage).toHaveCSS('max-height', '144px');
    expect((await featureImage.boundingBox())?.height ?? Infinity).toBeLessThanOrEqual(144);
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
    const detailAxe = await new AxeBuilder({ page }).analyze();
    expect(detailAxe.violations).toEqual([]);

    await page.goto(`/recipes/${recipeId}/edit`);
    await page.getByRole('button', { name: 'Manage recipe photos' }).click();
    const editPhotoDialog = page.getByRole('dialog', { name: 'Manage recipe photos' });
    await editPhotoDialog.getByRole('button', { name: 'Remove photo 1' }).click();
    await expect(editPhotoDialog.locator('.recipe-photo-grid-item')).toHaveCount(6);
    await editPhotoDialog.getByRole('button', { name: 'Done' }).click();

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
