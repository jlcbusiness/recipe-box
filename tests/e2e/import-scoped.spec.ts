import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import {
  buildBundleManifest,
  type ExportScope,
  exportTableNames,
  type PortableData,
} from '../../src/lib/exports/rules';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

type ScopedImageFile = { path: string; bytes: Uint8Array };

function createScopedArchive(
  scope: Exclude<ExportScope, { type: 'database' }>,
  publications: PortableData['records']['publications'],
  recipes: PortableData['records']['recipes'] = [],
  imageFiles: ScopedImageFile[] = [],
  mediaAssets: PortableData['records']['media_assets'] = [],
) {
  const data: PortableData = {
    format: 'recipe-box-data',
    schema_version: 1,
    scope,
    account_preferences: {},
    records: Object.fromEntries(
      exportTableNames.map((table) => [table, []]),
    ) as unknown as PortableData['records'],
  };
  data.records.publications = publications;
  data.records.recipes = recipes;
  data.records.media_assets = mediaAssets;
  const dataBytes = strToU8(JSON.stringify(data));
  const files = [{ path: 'data.json', bytes: dataBytes }, ...imageFiles];
  const manifest = buildBundleManifest(scope, files, '0.1.0', new Date());
  return Buffer.from(
    zipSync(
      Object.fromEntries([
        ['data.json', dataBytes],
        ['manifest.json', strToU8(JSON.stringify(manifest))],
        ...imageFiles.map(({ path, bytes }) => [path, bytes]),
      ]),
    ),
  );
}

function serviceHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function ownerHeaders(anonKey: string, accessToken: string) {
  return { apikey: anonKey, Authorization: `Bearer ${accessToken}` };
}

async function choosePicklistOption(picklist: Locator, optionLabel: string) {
  await picklist.click();
  const menu = picklist.page().getByRole('listbox');
  await expect(menu).toHaveClass(/database-import-picklist-menu/);
  const menuBounds = await menu.boundingBox();
  expect(menuBounds?.width).toBeLessThanOrEqual(256);
  await menu.getByRole('option', { name: optionLabel }).click();
}

async function chooseRecipeAction(group: Locator, actionLabel: string) {
  await group.getByRole('radio', { name: actionLabel, exact: true }).check();
}

async function listStorageFolder(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  serviceRoleKey: string,
  prefix: string,
) {
  const response = await request.post(`${apiUrl}/storage/v1/object/list/recipe-media`, {
    headers: serviceHeaders(serviceRoleKey),
    data: { prefix, limit: 100, offset: 0 },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as Array<{ name: string }>;
}

function createPublicationMediaArchive({
  createdAt,
  fullImageBytes,
  publicationName,
  thumbnailBytes,
}: {
  createdAt: string;
  fullImageBytes: Uint8Array;
  publicationName: string;
  thumbnailBytes: Uint8Array;
}) {
  const publicationId = randomUUID();
  const assetId = randomUUID();
  const fullPath = `images/${assetId}/full.webp`;
  const thumbnailPath = `images/${assetId}/thumbnail.webp`;
  const publication = {
    id: publicationId,
    publication_type: 'book',
    name: publicationName,
    author: null,
    edition: null,
    isbn: null,
    retailer_url: null,
    site_url: null,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
    trashed_at: null,
  };
  const mediaAsset: PortableData['records']['media_assets'][number] = {
    id: assetId,
    publication_id: publicationId,
    recipe_id: null,
    asset_type: 'publication_cover',
    status: 'ready',
    full_path: fullPath,
    thumbnail_path: thumbnailPath,
    content_type: 'image/webp',
    description: null,
    position: 0,
    is_primary: false,
    byte_size: fullImageBytes.byteLength + thumbnailBytes.byteLength,
    width: 32,
    height: 24,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const archive = createScopedArchive(
    { type: 'publication', id: publicationId },
    [publication],
    [],
    [
      { path: fullPath, bytes: fullImageBytes },
      { path: thumbnailPath, bytes: thumbnailBytes },
    ],
    [mediaAsset],
  );
  return { archive, mediaAsset, publicationId };
}

function createRecipeArchive({
  createdAt,
  publicationId = randomUUID(),
  publicationType = 'book',
  publicationName,
  recipeId = randomUUID(),
  recipeName,
  isPrivate = true,
}: {
  createdAt: string;
  publicationId?: string;
  publicationType?: string;
  publicationName: string;
  recipeId?: string;
  recipeName: string;
  isPrivate?: boolean;
}) {
  const publication = {
    id: publicationId,
    publication_type: publicationType,
    name: publicationName,
    author: 'Kitchen Archive',
    edition: null,
    isbn: null,
    retailer_url: null,
    site_url: null,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
    trashed_at: null,
  };
  const recipe = {
    id: recipeId,
    name: recipeName,
    publication_id: publicationId,
    state: 'want_to_try',
    notes_markdown: '',
    is_private: isPrivate,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
    trashed_at: null,
  };
  return createScopedArchive({ type: 'recipe', id: recipeId }, [publication], [recipe]);
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(?:recipes|publications)(?:\/|$)/);
}

async function activate(
  page: import('@playwright/test').Page,
  button: import('@playwright/test').Locator,
  isMobile: boolean,
) {
  if (isMobile) {
    await button.tap();
  } else {
    await button.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
  }
}

async function openRecipeImport(page: import('@playwright/test').Page, isMobile: boolean) {
  if (isMobile) {
    await activate(page, page.getByRole('button', { name: 'Publication transfer options' }), true);
    const menu = page.getByRole('menu', { name: 'Publication transfer actions' });
    await expect(menu).toBeVisible();
    await activate(page, menu.getByRole('menuitem', { name: 'Import recipe' }), true);
    return;
  }

  await activate(page, page.getByRole('button', { name: 'Import recipe' }), false);
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const elements = [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth,
        };
      })
      .filter((element) => element.right > viewportWidth + 1 || element.left < -1)
      .sort((left, right) => right.right - left.right);
    return {
      viewportWidth,
      scrollWidth: document.documentElement.scrollWidth,
      elements: elements.slice(0, 8),
    };
  });
  expect(overflow.scrollWidth, JSON.stringify(overflow.elements)).toBeLessThanOrEqual(
    overflow.viewportWidth,
  );
}

async function expectPicklistsInsideDialog(dialog: Locator) {
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds).not.toBeNull();
  const picklistBounds = await dialog.locator('.database-import-picklist').evaluateAll((elements) =>
    elements.map((element) => {
      const { left, right, width } = element.getBoundingClientRect();
      return { left, right, width };
    }),
  );
  expect(picklistBounds.length).toBeGreaterThan(0);
  for (const bounds of picklistBounds) {
    expect(bounds.width).toBeLessThanOrEqual(256);
    expect(bounds.left).toBeGreaterThanOrEqual(dialogBounds?.x ?? 0);
    expect(bounds.right).toBeLessThanOrEqual((dialogBounds?.x ?? 0) + (dialogBounds?.width ?? 0));
  }
}

test('imports publication and recipe bundles from their entry points @e2e @a11y', async ({
  browser,
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  const isMobile = testInfo.project.name === 'Fold 6';
  let concurrentPage: import('@playwright/test').Page | null = null;
  const createdAt = new Date().toISOString();
  const publicationName = `Portable cookbook ${randomUUID()}`;
  const sourcePublicationId = randomUUID();
  const publication = {
    id: sourcePublicationId,
    publication_type: 'book',
    name: publicationName,
    author: 'Kitchen Archive',
    edition: null,
    isbn: null,
    retailer_url: null,
    site_url: null,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
    trashed_at: null,
  };
  const publicationArchive = createScopedArchive({ type: 'publication', id: sourcePublicationId }, [
    publication,
  ]);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/publications');
    const libraryImport = page.getByRole('button', { name: 'Import publication' });
    if (isMobile) expect((await libraryImport.boundingBox())?.height).toBeGreaterThanOrEqual(48);
    await activate(page, libraryImport, isMobile);

    let dialog = page.getByRole('dialog', { name: 'Import publication' });
    await dialog.getByLabel('Publication archive').setInputFiles({
      name: 'publication-export.zip',
      mimeType: 'application/zip',
      buffer: publicationArchive,
    });
    await expect(dialog.getByRole('button', { name: 'Import publication' })).toBeEnabled();
    if (testInfo.project.name === 'chromium') {
      const accessibility = await new AxeBuilder({ page })
        .include('.database-import-dialog')
        .analyze();
      expect(accessibility.violations).toEqual([]);
    }
    if (isMobile) await expectNoHorizontalOverflow(page);
    await activate(page, dialog.getByRole('button', { name: 'Import publication' }), isMobile);

    await expect(page).toHaveURL(/\/publications\/[0-9a-f-]+$/i);
    await expect(page.getByRole('heading', { name: publicationName })).toBeVisible();
    const destinationPublicationId = new URL(page.url()).pathname.split('/').at(-1);
    expect(destinationPublicationId).toBeTruthy();

    const reviewPublicationArchive = async () => {
      await page.goto('/publications');
      await activate(page, page.getByRole('button', { name: 'Import publication' }), isMobile);
      const publicationDialog = page.getByRole('dialog', { name: 'Import publication' });
      await publicationDialog.getByLabel('Publication archive').setInputFiles({
        name: 'publication-export.zip',
        mimeType: 'application/zip',
        buffer: publicationArchive,
      });
      await expect(
        publicationDialog.getByLabel(`Import choice for ${publicationName}`),
      ).toBeVisible();
      if (isMobile) await expectPicklistsInsideDialog(publicationDialog);
      return publicationDialog;
    };

    let publicationDialog = await reviewPublicationArchive();
    const publicationChoice = publicationDialog.getByLabel(`Import choice for ${publicationName}`);
    const publicationCommit = publicationDialog.getByRole('button', {
      name: 'Import publication',
    });
    await expect(publicationChoice).toContainText('Choose an action');
    await expect(publicationCommit).toBeDisabled();
    await choosePicklistOption(publicationChoice, 'Keep existing');
    await activate(page, publicationCommit, isMobile);
    await expect(page).toHaveURL(`/publications/${destinationPublicationId}`);

    publicationDialog = await reviewPublicationArchive();
    await choosePicklistOption(
      publicationDialog.getByLabel(`Import choice for ${publicationName}`),
      'Create duplicate',
    );
    await activate(
      page,
      publicationDialog.getByRole('button', { name: 'Import publication' }),
      isMobile,
    );
    await expect(page).toHaveURL(/\/publications\/[0-9a-f-]+$/i);
    const duplicatePublicationId = new URL(page.url()).pathname.split('/').at(-1);
    expect(duplicatePublicationId).not.toBe(destinationPublicationId);
    await expect(
      page.getByRole('heading', { name: `${publicationName} (Imported)` }),
    ).toBeVisible();

    publicationDialog = await reviewPublicationArchive();
    await choosePicklistOption(
      publicationDialog.getByLabel(`Import choice for ${publicationName}`),
      'Replace',
    );
    await activate(
      page,
      publicationDialog.getByRole('button', { name: 'Import publication' }),
      isMobile,
    );
    await expect(page).toHaveURL(`/publications/${destinationPublicationId}`);
    await expect(page.getByRole('heading', { name: publicationName })).toBeVisible();

    const recipeName = `Portable lemon cake ${randomUUID()}`;
    const sourceRecipeId = randomUUID();
    const sourceRecipePublicationId = randomUUID();
    const recipeArchive = createRecipeArchive({
      createdAt,
      publicationId: sourceRecipePublicationId,
      publicationName,
      recipeId: sourceRecipeId,
      recipeName,
    });

    await page.goto(`/publications/${destinationPublicationId}`);
    if (isMobile) {
      const transferTrigger = page.getByRole('button', { name: 'Publication transfer options' });
      expect((await transferTrigger.boundingBox())?.height).toBeCloseTo(40, 0);
    }
    await openRecipeImport(page, isMobile);

    dialog = page.getByRole('dialog', { name: 'Import recipe' });
    await dialog.getByLabel('Recipe archive').setInputFiles({
      name: 'recipe-export.zip',
      mimeType: 'application/zip',
      buffer: recipeArchive,
    });
    await expect(dialog.getByLabel('Destination publication')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Import recipe' })).toBeEnabled();
    if (testInfo.project.name === 'chromium') {
      const accessibility = await new AxeBuilder({ page })
        .include('.database-import-dialog')
        .analyze();
      expect(accessibility.violations).toEqual([]);
    }
    if (isMobile) await expectNoHorizontalOverflow(page);
    await activate(page, dialog.getByRole('button', { name: 'Import recipe' }), isMobile);

    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/i);
    await expect(page.getByRole('heading', { name: recipeName })).toBeVisible();
    const destinationRecipeId = new URL(page.url()).pathname.split('/').at(-1);
    expect(destinationRecipeId).toBeTruthy();

    const reviewRecipeArchive = async (archive: Buffer) => {
      await page.goto(`/publications/${destinationPublicationId}`);
      await openRecipeImport(page, isMobile);
      const recipeDialog = page.getByRole('dialog', { name: 'Import recipe' });
      await recipeDialog.getByLabel('Recipe archive').setInputFiles({
        name: 'recipe-export.zip',
        mimeType: 'application/zip',
        buffer: archive,
      });
      await expect(
        recipeDialog.getByRole('group', { name: `Import choice for ${recipeName}` }),
      ).toBeVisible();
      return recipeDialog;
    };

    let recipeDialog = await reviewRecipeArchive(recipeArchive);
    await chooseRecipeAction(
      recipeDialog.getByRole('group', { name: `Import choice for ${recipeName}` }),
      'Replace',
    );
    concurrentPage = await browser.newPage();
    await signIn(concurrentPage, user.email, user.password);
    await concurrentPage.goto(`/recipes/${destinationRecipeId}/edit`);
    await concurrentPage.getByLabel('Notes (Markdown)').fill('Concurrent destination edit');
    await concurrentPage.getByRole('button', { name: 'Save recipe' }).click();
    await expect(concurrentPage.getByRole('heading', { name: recipeName })).toBeVisible();
    await activate(page, recipeDialog.getByRole('button', { name: 'Import recipe' }), isMobile);
    await expect(recipeDialog.getByRole('alert')).toHaveText(
      'A selected record changed. Preview the archive again.',
    );
    const refreshPreview = recipeDialog.getByRole('button', { name: 'Refresh preview' });
    await activate(page, refreshPreview, isMobile);
    await expect(recipeDialog.locator('.database-import-feedback[role="status"]')).toHaveText(
      'Preview ready.',
    );
    const refreshedRecipeChoice = recipeDialog.getByRole('group', {
      name: `Import choice for ${recipeName}`,
    });
    await expect(refreshedRecipeChoice.getByRole('radio', { name: 'Replace' })).not.toBeChecked();
    await expect(recipeDialog.getByRole('button', { name: 'Import recipe' })).toBeDisabled();
    await chooseRecipeAction(refreshedRecipeChoice, 'Replace');
    await activate(page, recipeDialog.getByRole('button', { name: 'Import recipe' }), isMobile);
    await expect(page).toHaveURL(`/recipes/${destinationRecipeId}`);
    await concurrentPage.close();
    concurrentPage = null;

    const cancelledRecipeName = `Cancelled cake ${randomUUID()}`;
    await page.goto(`/publications/${destinationPublicationId}`);
    await openRecipeImport(page, isMobile);
    recipeDialog = page.getByRole('dialog', { name: 'Import recipe' });
    await recipeDialog.getByLabel('Recipe archive').setInputFiles({
      name: 'cancelled-recipe-export.zip',
      mimeType: 'application/zip',
      buffer: createRecipeArchive({
        createdAt,
        publicationName,
        recipeName: cancelledRecipeName,
      }),
    });
    await expect(recipeDialog.getByLabel('Destination publication')).toBeVisible();
    await activate(
      page,
      recipeDialog.getByRole('button', { name: 'Close import dialog' }),
      isMobile,
    );
    await expect(recipeDialog).not.toBeVisible();
    await expect(page).toHaveURL(`/publications/${destinationPublicationId}`);
    await expect(page.getByRole('heading', { name: cancelledRecipeName })).toHaveCount(0);

    recipeDialog = await reviewRecipeArchive(recipeArchive);
    const recipeChoice = recipeDialog.getByRole('group', {
      name: `Import choice for ${recipeName}`,
    });
    const recipeCommit = recipeDialog.getByRole('button', { name: 'Import recipe' });
    await expect(recipeChoice.getByRole('radio', { name: 'Replace' })).toBeVisible();
    await expect(recipeChoice.getByRole('radio', { name: 'Duplicate' })).toBeVisible();
    await expect(recipeChoice.getByRole('radio', { name: 'Ignore' })).toHaveCount(0);
    await expect(recipeCommit).toBeDisabled();
    await activate(
      page,
      recipeDialog.getByRole('button', { name: 'Close import dialog' }),
      isMobile,
    );
    await expect(recipeDialog).not.toBeVisible();
    await expect(page).toHaveURL(`/publications/${destinationPublicationId}`);

    recipeDialog = await reviewRecipeArchive(recipeArchive);
    await chooseRecipeAction(
      recipeDialog.getByRole('group', { name: `Import choice for ${recipeName}` }),
      'Duplicate',
    );
    if (isMobile) await expectPicklistsInsideDialog(recipeDialog);
    await choosePicklistOption(
      recipeDialog.getByLabel('Destination publication'),
      `${publicationName} (Imported)`,
    );
    await activate(page, recipeDialog.getByRole('button', { name: 'Import recipe' }), isMobile);
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/i);
    const duplicateRecipeId = new URL(page.url()).pathname.split('/').at(-1);
    expect(duplicateRecipeId).not.toBe(destinationRecipeId);
    await expect(page.getByRole('heading', { name: `${recipeName} (Imported)` })).toBeVisible();

    recipeDialog = await reviewRecipeArchive(recipeArchive);
    await chooseRecipeAction(
      recipeDialog.getByRole('group', { name: `Import choice for ${recipeName}` }),
      'Replace',
    );
    await activate(page, recipeDialog.getByRole('button', { name: 'Import recipe' }), isMobile);
    await expect(page).toHaveURL(`/recipes/${destinationRecipeId}`);
    await expect(page.getByRole('heading', { name: recipeName })).toBeVisible();

    const newPublicationName = `Created publication ${randomUUID()}`;
    const newRecipeName = `Unmatched recipe ${randomUUID()}`;
    await page.goto(`/publications/${destinationPublicationId}`);
    await openRecipeImport(page, isMobile);
    recipeDialog = page.getByRole('dialog', { name: 'Import recipe' });
    await recipeDialog.getByLabel('Recipe archive').setInputFiles({
      name: 'new-publication-recipe.zip',
      mimeType: 'application/zip',
      buffer: createRecipeArchive({
        createdAt,
        publicationName: newPublicationName,
        recipeName: newRecipeName,
      }),
    });
    await expect(recipeDialog.getByLabel('Destination publication')).toBeVisible();
    await expect(recipeDialog.getByRole('button', { name: 'Import recipe' })).toBeEnabled();
    await activate(page, recipeDialog.getByRole('button', { name: 'Import recipe' }), isMobile);
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/i);
    await expect(page.getByRole('heading', { name: newRecipeName })).toBeVisible();
    await page.goto('/publications');
    await expect(page.getByRole('link', { name: newPublicationName })).toBeVisible();

    await page.goto(`/publications/${duplicatePublicationId}`);
    await openRecipeImport(page, isMobile);
    recipeDialog = page.getByRole('dialog', { name: 'Import recipe' });
    await recipeDialog.getByLabel('Recipe archive').setInputFiles({
      name: 'new-publication-recipe.zip',
      mimeType: 'application/zip',
      buffer: createRecipeArchive({
        createdAt,
        publicationName: newPublicationName,
        recipeName: newRecipeName,
      }),
    });
    await expect(recipeDialog.getByText(`Existing recipe in ${publicationName}.`)).toBeVisible();
    const createHereChoice = recipeDialog.getByRole('group', {
      name: `Import choice for ${newRecipeName}`,
    });
    await chooseRecipeAction(createHereChoice, 'Create here');
    await expect(recipeDialog.getByLabel('Destination publication')).toHaveCount(0);
    await activate(page, recipeDialog.getByRole('button', { name: 'Import recipe' }), isMobile);
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/i);
    await expect(page.getByRole('heading', { name: `${newRecipeName} (Imported)` })).toBeVisible();
    await page.goto(`/publications/${duplicatePublicationId}`);
    await expect(page.getByText(`${newRecipeName} (Imported)`)).toBeVisible();
  } finally {
    await concurrentPage?.close();
    await deleteTestUser(request, user);
  }
});

test('publication choices control recipe-level import behavior @e2e', async ({ page, request }) => {
  const user = await createTestUser(request);
  const createdAt = new Date().toISOString();
  const publicationId = randomUUID();
  const publicationName = `Graph cookbook ${randomUUID()}`;
  const recipeId = randomUUID();
  const recipeName = `Graph recipe ${randomUUID()}`;
  const publication = {
    id: publicationId,
    publication_type: 'book',
    name: publicationName,
    author: null,
    edition: null,
    isbn: null,
    retailer_url: null,
    site_url: null,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
    trashed_at: null,
  };
  const recipe = {
    id: recipeId,
    publication_id: publicationId,
    name: recipeName,
    state: 'want_to_try',
    notes_markdown: 'Imported recipe details.',
    is_private: true,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
    trashed_at: null,
  };
  const archive = createScopedArchive(
    { type: 'publication', id: publicationId },
    [publication],
    [recipe],
  );

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/publications');
    await page.getByRole('button', { name: 'Import publication' }).click();
    let dialog = page.getByRole('dialog', { name: 'Import publication' });
    await dialog.getByLabel('Publication archive').setInputFiles({
      name: 'publication-graph.zip',
      mimeType: 'application/zip',
      buffer: archive,
    });
    await expect(dialog.getByRole('radio', { name: 'Create New' })).toBeVisible();
    await expect(
      dialog.getByRole('radio', { name: "Don't - Choose Recipe Destinations" }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Import publication' }).click();
    await expect(page).toHaveURL(/\/publications\/[0-9a-f-]+$/i);
    const destinationPublicationId = new URL(page.url()).pathname.split('/').at(-1);
    expect(destinationPublicationId).toBeTruthy();

    const otherPublicationName = `Other destination ${randomUUID()}`;
    await page.goto('/publications');
    await page.getByRole('link', { name: 'Add publication' }).click();
    await page.getByRole('radio', { name: 'Book' }).check();
    await page.getByLabel('Name').fill(otherPublicationName);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: otherPublicationName })).toBeVisible();
    const otherPublicationId = new URL(page.url()).pathname.split('/').at(-1);
    expect(otherPublicationId).toBeTruthy();

    const reviewArchive = async () => {
      await page.goto('/publications');
      await page.getByRole('button', { name: 'Import publication' }).click();
      const importDialog = page.getByRole('dialog', { name: 'Import publication' });
      await importDialog.getByLabel('Publication archive').setInputFiles({
        name: 'publication-graph.zip',
        mimeType: 'application/zip',
        buffer: archive,
      });
      await expect(importDialog.getByLabel(`Import choice for ${publicationName}`)).toBeVisible();
      return importDialog;
    };

    dialog = await reviewArchive();
    const publicationChoice = dialog.getByLabel(`Import choice for ${publicationName}`);
    await choosePicklistOption(publicationChoice, 'Create duplicate');
    await expect(dialog.getByLabel(`Import choice for ${recipeName}`)).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Import publication' }).click();
    await expect(page).toHaveURL(/\/publications\/[0-9a-f-]+$/i);
    const duplicatePublicationId = new URL(page.url()).pathname.split('/').at(-1);
    expect(duplicatePublicationId).not.toBe(destinationPublicationId);
    await expect(
      page.getByRole('heading', { name: `${publicationName} (Imported)` }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: recipeName })).toBeVisible();

    dialog = await reviewArchive();
    await choosePicklistOption(
      dialog.getByLabel(`Import choice for ${publicationName}`),
      'Keep existing',
    );
    const recipeChoice = dialog.getByLabel(`Import choice for ${recipeName}`);
    await expect(recipeChoice).toBeVisible();
    await choosePicklistOption(recipeChoice, 'Duplicate');
    await choosePicklistOption(
      dialog.getByLabel(`Destination publication for ${recipeName}`),
      otherPublicationName,
    );
    await dialog.getByRole('button', { name: 'Import publication' }).click();
    await expect(page).toHaveURL(`/publications/${destinationPublicationId}`);
    await page.goto(`/publications/${otherPublicationId}`);
    await expect(page.getByText(`${recipeName} (Imported)`)).toBeVisible();

    dialog = await reviewArchive();
    await choosePicklistOption(
      dialog.getByLabel(`Import choice for ${publicationName}`),
      'Replace',
    );
    await expect(dialog.getByLabel(`Import choice for ${recipeName}`)).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Import publication' }).click();
    await expect(page).toHaveURL(`/publications/${destinationPublicationId}`);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('replaces a publication with three recipes and four media assets @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();
  const createdAt = new Date().toISOString();
  const publicationId = randomUUID();
  const publicationName = `Four image publication ${randomUUID()}`;
  const publication = {
    id: publicationId,
    publication_type: 'book',
    name: publicationName,
    author: null,
    edition: null,
    isbn: null,
    retailer_url: null,
    site_url: null,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
    trashed_at: null,
  };
  const recipes = [
    'Ginger Miso Mushroom Rice',
    'Sesame Cucumber Noodle Salad',
    'Crisp Chickpea Flatbread',
  ].map((name) => ({
    id: randomUUID(),
    publication_id: publicationId,
    name,
    state: 'want_to_try',
    notes_markdown: `Imported details for ${name}.`,
    is_private: true,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
    trashed_at: null,
  }));
  const fullImageBytes = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: { r: 126, g: 154, b: 116 },
    },
  })
    .webp()
    .toBuffer();
  const thumbnailImageBytes = await sharp(fullImageBytes).resize(16, 12).webp().toBuffer();
  const mediaOwners: Array<{
    publicationId: string | null;
    recipeId: string | null;
    assetType: 'publication_cover' | 'recipe_photo';
  }> = [
    { publicationId, recipeId: null, assetType: 'publication_cover' },
    ...recipes.map((recipe) => ({
      publicationId: null,
      recipeId: recipe.id,
      assetType: 'recipe_photo' as const,
    })),
  ];
  const imageFiles: ScopedImageFile[] = [];
  const mediaAssets: PortableData['records']['media_assets'] = [];
  for (const [position, owner] of mediaOwners.entries()) {
    const assetId = randomUUID();
    const fullPath = `images/${assetId}/full.webp`;
    const thumbnailPath = `images/${assetId}/thumbnail.webp`;
    imageFiles.push(
      { path: fullPath, bytes: fullImageBytes },
      { path: thumbnailPath, bytes: thumbnailImageBytes },
    );
    mediaAssets.push({
      id: assetId,
      publication_id: owner.publicationId,
      recipe_id: owner.recipeId,
      asset_type: owner.assetType,
      status: 'ready',
      full_path: fullPath,
      thumbnail_path: thumbnailPath,
      content_type: 'image/webp',
      description: null,
      position,
      is_primary: false,
      byte_size: fullImageBytes.byteLength + thumbnailImageBytes.byteLength,
      width: 32,
      height: 24,
      created_at: createdAt,
      updated_at: createdAt,
    });
  }
  const archive = createScopedArchive(
    { type: 'publication', id: publicationId },
    [publication],
    recipes,
    imageFiles,
    mediaAssets,
  );

  try {
    await signIn(page, user.email, user.password);
    const importArchive = async () => {
      await page.goto('/publications');
      await page.getByRole('button', { name: 'Import publication' }).click();
      const dialog = page.getByRole('dialog', { name: 'Import publication' });
      await dialog.getByLabel('Publication archive').setInputFiles({
        name: 'three-recipes-four-images.zip',
        mimeType: 'application/zip',
        buffer: archive,
      });
      return dialog;
    };

    let dialog = await importArchive();
    await dialog.getByRole('button', { name: 'Import publication' }).click();
    await expect(page).toHaveURL(/\/publications\/[0-9a-f-]+$/i);
    const destinationPublicationId = new URL(page.url()).pathname.split('/').at(-1);
    expect(destinationPublicationId).toBeTruthy();

    dialog = await importArchive();
    await choosePicklistOption(
      dialog.getByLabel(`Import choice for ${publicationName}`),
      'Replace',
    );
    await dialog.getByRole('button', { name: 'Import publication' }).click();
    await expect(page).toHaveURL(`/publications/${destinationPublicationId}`);

    const mediaResponse = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=id,publication_id,recipe_id`,
      { headers: ownerHeaders(anonKey, user.accessToken) },
    );
    expect(mediaResponse.ok(), await mediaResponse.text()).toBeTruthy();
    expect(await mediaResponse.json()).toHaveLength(4);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('an unmatched publication can route recipes without creating the publication @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  const createdAt = new Date().toISOString();
  const sourcePublicationId = randomUUID();
  const sourcePublicationName = `Unmatched source ${randomUUID()}`;
  const recipeId = randomUUID();
  const recipeName = `Routed recipe ${randomUUID()}`;
  const destinationPublicationId = randomUUID();
  const destinationPublication = {
    id: destinationPublicationId,
    publication_type: 'book',
    name: `Destination ${randomUUID()}`,
    author: null,
    edition: null,
    isbn: null,
    retailer_url: null,
    site_url: null,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
    trashed_at: null,
  };
  const recipe = {
    id: recipeId,
    publication_id: sourcePublicationId,
    name: recipeName,
    state: 'want_to_try',
    notes_markdown: '',
    is_private: true,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
    trashed_at: null,
  };
  const skippedRecipe = {
    ...recipe,
    id: randomUUID(),
    name: `Skipped recipe ${randomUUID()}`,
  };
  const archive = createScopedArchive(
    { type: 'publication', id: sourcePublicationId },
    [
      {
        id: sourcePublicationId,
        publication_type: 'book',
        name: sourcePublicationName,
        author: null,
        edition: null,
        isbn: null,
        retailer_url: null,
        site_url: null,
        version: 1,
        created_at: createdAt,
        updated_at: createdAt,
        trashed_at: null,
      },
    ],
    [recipe, skippedRecipe],
  );

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/publications');
    await page.getByRole('link', { name: 'Add publication' }).click();
    await page.getByRole('radio', { name: 'Book' }).check();
    await page.getByLabel('Name').fill(destinationPublication.name);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: destinationPublication.name })).toBeVisible();
    const createdDestinationId = new URL(page.url()).pathname.split('/').at(-1);
    expect(createdDestinationId).toBeTruthy();

    await page.goto('/publications');
    await page.getByRole('button', { name: 'Import publication' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import publication' });
    await dialog.getByLabel('Publication archive').setInputFiles({
      name: 'unmatched-publication.zip',
      mimeType: 'application/zip',
      buffer: archive,
    });
    const omitPublication = dialog.getByRole('radio', {
      name: "Don't - Choose Recipe Destinations",
    });
    await expect(omitPublication).toBeVisible();
    await expect(dialog.locator('.database-import-source-choice')).toHaveCSS('display', 'grid');
    await expect(dialog.locator('.database-import-source-choice > label').first()).toHaveCSS(
      'display',
      'flex',
    );
    await omitPublication.check();
    if (testInfo.project.name === 'Fold 6') await expectPicklistsInsideDialog(dialog);
    await choosePicklistOption(
      dialog.getByLabel(`Destination publication for ${recipeName}`),
      destinationPublication.name,
    );
    await choosePicklistOption(
      dialog.getByLabel(`Destination publication for ${skippedRecipe.name}`),
      "Don't import recipe",
    );
    await dialog.getByRole('button', { name: 'Import publication' }).click();
    await expect(dialog).not.toBeVisible();
    await page.goto(`/publications/${createdDestinationId}`);
    await expect(page.getByRole('link', { name: recipeName })).toBeVisible();
    await expect(page.getByRole('link', { name: skippedRecipe.name })).toHaveCount(0);
    await page.goto('/publications');
    await expect(page.getByRole('link', { name: sourcePublicationName })).toHaveCount(0);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('replaces a public Recipe Tin recipe without importing the collection @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();
  const createdAt = new Date().toISOString();
  const recipeName = 'Milk Toast';
  const archive = createRecipeArchive({
    createdAt,
    publicationType: 'collection',
    publicationName: 'Recipe Tin',
    recipeName,
    isPrivate: false,
  });

  try {
    await signIn(page, user.email, user.password);
    const recipeTinResponse = await request.get(
      `${apiUrl}/rest/v1/publications?select=id&publication_type=eq.collection`,
      { headers: ownerHeaders(anonKey, user.accessToken) },
    );
    expect(recipeTinResponse.ok(), await recipeTinResponse.text()).toBeTruthy();
    const [recipeTin] = (await recipeTinResponse.json()) as Array<{ id: string }>;
    expect(recipeTin?.id).toBeTruthy();

    const importArchive = async () => {
      await page.goto(`/publications/${recipeTin.id}`);
      await openRecipeImport(page, (page.viewportSize()?.width ?? 1280) <= 720);
      const dialog = page.getByRole('dialog', { name: 'Import recipe' });
      await dialog.getByLabel('Recipe archive').setInputFiles({
        name: 'public-milk-toast.zip',
        mimeType: 'application/zip',
        buffer: archive,
      });
      return dialog;
    };

    let dialog = await importArchive();
    await expect(dialog.getByLabel('Destination publication')).toBeVisible();
    await dialog.getByRole('button', { name: 'Import recipe' }).click();
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/i);
    const destinationRecipeId = new URL(page.url()).pathname.split('/').at(-1);
    expect(destinationRecipeId).toBeTruthy();

    dialog = await importArchive();
    const recipeChoice = dialog.getByRole('group', { name: 'Import choice for Milk Toast' });
    await expect(recipeChoice.getByRole('radio', { name: 'Replace' })).toBeVisible();
    await expect(recipeChoice.getByRole('radio', { name: 'Duplicate' })).toBeVisible();
    await expect(recipeChoice.getByRole('radio', { name: 'Ignore' })).toHaveCount(0);
    await chooseRecipeAction(recipeChoice, 'Replace');
    await dialog.getByRole('button', { name: 'Import recipe' }).click();
    await expect(page).toHaveURL(`/recipes/${destinationRecipeId}`);
    await expect(page.getByRole('heading', { name: recipeName })).toBeVisible();

    const recipeResponse = await request.get(
      `${apiUrl}/rest/v1/recipes?select=id,publication_id,is_private,name&id=eq.${destinationRecipeId}`,
      { headers: ownerHeaders(anonKey, user.accessToken) },
    );
    expect(recipeResponse.ok(), await recipeResponse.text()).toBeTruthy();
    const recipes = (await recipeResponse.json()) as Array<{
      id: string;
      publication_id: string;
      is_private: boolean;
      name: string;
    }>;
    expect(recipes).toEqual([
      expect.objectContaining({
        id: destinationRecipeId,
        publication_id: expect.any(String),
        is_private: false,
        name: recipeName,
      }),
    ]);

    const collectionResponse = await request.get(
      `${apiUrl}/rest/v1/publications?select=id&publication_type=eq.collection`,
      { headers: ownerHeaders(anonKey, user.accessToken) },
    );
    expect(collectionResponse.ok(), await collectionResponse.text()).toBeTruthy();
    expect(await collectionResponse.json()).toHaveLength(1);

    dialog = await importArchive();
    const unselectedRecipeChoice = dialog.getByRole('group', {
      name: 'Import choice for Milk Toast',
    });
    await expect(unselectedRecipeChoice.getByRole('radio', { name: 'Replace' })).toBeVisible();
    await expect(unselectedRecipeChoice.getByRole('radio', { name: 'Duplicate' })).toBeVisible();
    await expect(unselectedRecipeChoice.getByRole('radio', { name: 'Ignore' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close import dialog' }).click();
    await expect(dialog).not.toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('stages scoped media in destination storage and removes partial staging on failure @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const { apiUrl, serviceRoleKey, anonKey } = await getLocalSupabaseConfig();
  const createdAt = new Date().toISOString();
  const validPublicationName = `Media import ${randomUUID()}`;
  const failedPublicationName = `Failed media import ${randomUUID()}`;
  const fullImageBytes = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: { r: 126, g: 154, b: 116 },
    },
  })
    .webp()
    .toBuffer();
  const thumbnailImageBytes = await sharp(fullImageBytes).resize(16, 12).webp().toBuffer();
  const invalidThumbnailBytes = Buffer.from('invalid webp variant');
  const validImport = createPublicationMediaArchive({
    createdAt,
    fullImageBytes,
    publicationName: validPublicationName,
    thumbnailBytes: thumbnailImageBytes,
  });
  const failedImport = createPublicationMediaArchive({
    createdAt,
    fullImageBytes,
    publicationName: failedPublicationName,
    thumbnailBytes: invalidThumbnailBytes,
  });
  let successfulStoragePaths: string[] = [];
  let dialog: import('@playwright/test').Locator | null = null;

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/publications');
    await page.getByRole('button', { name: 'Import publication' }).click();
    dialog = page.getByRole('dialog', { name: 'Import publication' });
    await dialog.getByLabel('Publication archive').setInputFiles({
      name: 'publication-with-media.zip',
      mimeType: 'application/zip',
      buffer: validImport.archive,
    });
    await expect(dialog.getByRole('button', { name: 'Import publication' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Import publication' }).click();
    await expect(page).toHaveURL(/\/publications\/[0-9a-f-]+$/i);
    const destinationPublicationId = new URL(page.url()).pathname.split('/').at(-1);
    expect(destinationPublicationId).toBeTruthy();

    const mediaResponse = await request.get(
      `${apiUrl}/rest/v1/media_assets?select=id,publication_id,full_path,thumbnail_path,byte_size,width,height&publication_id=eq.${destinationPublicationId}`,
      { headers: ownerHeaders(anonKey, user.accessToken) },
    );
    expect(mediaResponse.ok(), await mediaResponse.text()).toBeTruthy();
    const [storedAsset] = (await mediaResponse.json()) as Array<{
      id: string;
      publication_id: string;
      full_path: string;
      thumbnail_path: string;
      byte_size: number;
      width: number;
      height: number;
    }>;
    expect(storedAsset).toMatchObject({
      publication_id: destinationPublicationId,
      full_path: `${user.id}/assets/${storedAsset.id}/full.webp`,
      thumbnail_path: `${user.id}/assets/${storedAsset.id}/thumb.webp`,
      byte_size: fullImageBytes.byteLength + thumbnailImageBytes.byteLength,
      width: 32,
      height: 24,
    });
    expect(storedAsset.id).not.toBe(validImport.mediaAsset.id);
    successfulStoragePaths = [storedAsset.full_path, storedAsset.thumbnail_path];
    for (const [path, expectedBytes] of [
      [storedAsset.full_path, fullImageBytes],
      [storedAsset.thumbnail_path, thumbnailImageBytes],
    ] as const) {
      const storedImage = await request.get(
        `${apiUrl}/storage/v1/object/authenticated/recipe-media/${path}`,
        { headers: ownerHeaders(anonKey, user.accessToken) },
      );
      expect(storedImage.ok()).toBeTruthy();
      expect(Buffer.from(await storedImage.body())).toEqual(expectedBytes);
    }

    const foldersBeforeFailure = (
      await listStorageFolder(request, apiUrl, serviceRoleKey, `${user.id}/assets`)
    )
      .map(({ name }) => name)
      .sort();
    await page.goto('/publications');
    await page.getByRole('button', { name: 'Import publication' }).click();
    dialog = page.getByRole('dialog', { name: 'Import publication' });
    await dialog.getByLabel('Publication archive').setInputFiles({
      name: 'publication-with-invalid-media.zip',
      mimeType: 'application/zip',
      buffer: failedImport.archive,
    });
    await expect(dialog.getByRole('button', { name: 'Import publication' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Import publication' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('An imported image variant is invalid.');
    const stagedFolders = await listStorageFolder(
      request,
      apiUrl,
      serviceRoleKey,
      `${user.id}/assets`,
    );
    expect(stagedFolders.map(({ name }) => name).sort()).toEqual(foldersBeforeFailure);
  } finally {
    try {
      if (dialog && (await dialog.isVisible())) {
        await dialog.getByRole('button', { name: 'Close import dialog' }).click();
      }
    } finally {
      try {
        if (successfulStoragePaths.length > 0) {
          const cleanup = await request.delete(`${apiUrl}/storage/v1/object/recipe-media`, {
            headers: serviceHeaders(serviceRoleKey),
            data: { prefixes: successfulStoragePaths },
          });
          expect(cleanup.ok(), await cleanup.text()).toBeTruthy();
        }
      } finally {
        await deleteTestUser(request, user);
      }
    }
  }
});
