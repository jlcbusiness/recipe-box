import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import {
  buildBundleManifest,
  exportTableNames,
  type PortableData,
} from '../../src/lib/exports/rules';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

function createDatabaseArchive(
  publications: PortableData['records']['publications'] = [],
  accountPreferences: PortableData['account_preferences'] = {},
  recipes: PortableData['records']['recipes'] = [],
  picklistValues: PortableData['records']['recipe_picklist_values'] = [],
  schemaVersion: 1 | 2 | 3 = 1,
) {
  const data: PortableData = {
    format: 'recipe-box-data',
    schema_version: schemaVersion,
    scope: { type: 'database' },
    account_preferences: accountPreferences,
    records: Object.fromEntries(
      exportTableNames
        .filter((table) => schemaVersion !== 1 || table !== 'recipe_ingredient_sets')
        .map((table) => [table, []]),
    ) as unknown as PortableData['records'],
  };
  data.records.publications = publications;
  data.records.recipes = recipes;
  data.records.recipe_picklist_values = picklistValues;
  const dataBytes = strToU8(JSON.stringify(data));
  const manifest = buildBundleManifest(
    { type: 'database' },
    [{ path: 'data.json', bytes: dataBytes }],
    '0.1.0',
    new Date(),
  );
  manifest.schema_version = schemaVersion;
  return Buffer.from(
    zipSync({
      'data.json': dataBytes,
      'manifest.json': strToU8(JSON.stringify(manifest)),
    }),
  );
}

function createRecipeWithPicklistArchive(
  accountPreferences: PortableData['account_preferences'] = {},
) {
  const suffix = randomUUID();
  const createdAt = new Date().toISOString();
  const publicationId = randomUUID();
  const recipeId = randomUUID();
  const foodTypeId = randomUUID();
  const verdictId = randomUUID();
  const enthusiasmId = randomUUID();
  const values = [
    { id: foodTypeId, category: 'food_type', value: `Import casserole ${suffix}` },
    { id: verdictId, category: 'verdict', value: `Import verdict ${suffix}` },
    { id: enthusiasmId, category: 'enthusiasm', value: `Import enthusiasm ${suffix}` },
  ];
  const picklistValues = values.map((value) => ({
    ...value,
    display_value: value.value,
    sort_order: 0,
    is_protected: false,
    created_at: createdAt,
  }));

  return createDatabaseArchive(
    [
      {
        id: publicationId,
        publication_type: 'book',
        name: `Import publication ${suffix}`,
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
    accountPreferences,
    [
      {
        id: recipeId,
        name: `Import recipe ${suffix}`,
        food_type_id: foodTypeId,
        state: 'tried',
        verdict_id: verdictId,
        enthusiasm_id: null,
        occasion_details: null,
        reason: null,
        serves: null,
        prep_time_minutes: null,
        mixing_time_minutes: null,
        marinate_time_minutes: null,
        chill_time_minutes: null,
        freeze_time_minutes: null,
        cook_time_minutes: null,
        bake_time_minutes: null,
        cooling_time_minutes: null,
        rest_time_minutes: null,
        total_time_minutes: null,
        notes_markdown: '',
        is_private: true,
        version: 1,
        created_at: createdAt,
        updated_at: createdAt,
        trashed_at: null,
        publication_id: publicationId,
        publication_page: null,
        recipe_url: null,
      },
    ],
    picklistValues,
    3,
  );
}

async function createPublication(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  headers: Record<string, string>,
  name: string,
  author: string,
) {
  const response = await request.post(`${apiUrl}/rest/v1/rpc/create_publication`, {
    headers,
    data: {
      p_name: name,
      p_publication_type: 'book',
      p_author: author,
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

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(?:recipes|publications)(?:\/|$)/);
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test('Settings imports a database bundle accessibly on desktop and Fold 6 @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Recipe columns' })).toHaveCSS(
      'margin-bottom',
      '0px',
    );
    await expect(page.getByRole('heading', { name: 'Trusted densities' })).toHaveCSS(
      'margin-bottom',
      '0px',
    );

    const dataManagement = page.getByRole('region', { name: 'Data management' });
    const importTrigger = dataManagement.getByRole('button', { name: 'Import database' });
    await expect(importTrigger).toBeVisible();
    await importTrigger.click();
    const importDialog = dataManagement.getByRole('dialog', { name: 'Import database' });
    await expect(importDialog).toBeVisible();
    await expect(importDialog.getByRole('button', { name: 'Choose ZIP' })).toBeVisible();
    if (testInfo.project.name === 'chromium') {
      const accessibility = await new AxeBuilder({ page })
        .include('.settings-data-management')
        .analyze();
      expect(accessibility.violations).toEqual([]);
    }

    if (testInfo.project.name === 'Fold 6') {
      await expectNoHorizontalOverflow(page);
    }

    await page.getByLabel('Database archive').setInputFiles({
      name: 'database-export.zip',
      mimeType: 'application/zip',
      buffer: createRecipeWithPicklistArchive({
        volume_system: 'metric',
        temperature_system: 'celsius',
        ingredient_color: 'teal',
        temperature_color: 'red',
        duration_color: 'orange',
        private_print_uses_colors: false,
      }),
    });
    const preview = importDialog.getByRole('region', { name: 'Import details' });
    await expect(preview).toBeVisible();
    const accountSettingsChoice = importDialog.getByRole('group', { name: 'Account settings' });
    await expect(accountSettingsChoice.getByLabel('Use settings from this archive')).toBeVisible();
    await expect(importDialog.getByRole('button', { name: 'Cancel import' })).toHaveCount(0);
    await expect(importDialog.locator('.database-import-feedback[role="status"]')).toHaveText(
      'Preview ready.',
    );
    await expect(importDialog.getByRole('button', { name: 'Import ZIP' })).toBeEnabled();
    const commitButton = importDialog.getByRole('button', { name: 'Import database' });
    await expect(commitButton).toBeDisabled();

    if (testInfo.project.name === 'chromium') {
      const previewAccessibility = await new AxeBuilder({ page })
        .include('.settings-data-management')
        .analyze();
      expect(previewAccessibility.violations).toEqual([]);
    }
    if (testInfo.project.name === 'Fold 6') {
      await expectNoHorizontalOverflow(page);
    }

    await accountSettingsChoice.getByLabel('Use settings from this archive').check();
    await expect(commitButton).toBeEnabled();
    if (testInfo.project.name === 'Fold 6') {
      await commitButton.tap();
    } else {
      await commitButton.click();
    }
    await expect(importDialog).not.toBeVisible();
    await expect(dataManagement.getByRole('status')).toHaveText('Import complete.');
    await page.goto('/settings');
    await expect(page.getByRole('combobox', { name: 'Temperature', exact: true })).toContainText(
      'Celsius',
    );
    const ingredientColorGroup = page.getByRole('group', { name: 'Ingredient color' });
    await ingredientColorGroup
      .getByRole('button', { name: 'Ingredient color: Dark Yellow' })
      .click();
    await expect(
      page
        .getByRole('group', { name: 'Ingredient color choices' })
        .getByRole('button', { name: 'Set ingredient color to Dark Yellow' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Omit instruction emphasis when printing')).toBeChecked();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Settings reports invalid archives and recovers for a valid retry @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  let releasePreview = () => {};
  let markPreviewRequested = () => {};
  const previewGate = new Promise<void>((resolve) => {
    releasePreview = resolve;
  });
  const previewRequested = new Promise<void>((resolve) => {
    markPreviewRequested = resolve;
  });
  await page.route('**/api/imports/preview', async (route) => {
    markPreviewRequested();
    await previewGate;
    await route.continue();
  });

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/settings');
    const dataManagement = page.getByRole('region', { name: 'Data management' });
    const importTrigger = dataManagement.getByRole('button', { name: 'Import database' });
    const importDialog = dataManagement.getByRole('dialog', { name: 'Import database' });
    const archiveInput = page.getByLabel('Database archive');
    const status = dataManagement.locator('.database-import-feedback[role="status"]');
    const openImportPane = async () => {
      await importTrigger.click();
      await expect(importDialog).toBeVisible();
    };
    const activate = async (button: import('@playwright/test').Locator) => {
      if (testInfo.project.name === 'Fold 6') {
        await button.tap();
      } else {
        await button.focus();
        await page.keyboard.press('Enter');
      }
    };

    await openImportPane();
    await archiveInput.setInputFiles({
      name: 'invalid-database-export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('not a zip archive'),
    });
    await previewRequested;
    await expect(importDialog.getByLabel('Import preparation')).toBeVisible();
    releasePreview();

    const alert = importDialog.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/\S/);
    await expect(alert).not.toContainText('recipe-exports');
    await activate(importDialog.getByRole('button', { name: 'Close import dialog' }));
    await expect(status).toHaveText('Import cancelled.');
    await expect(importDialog).not.toBeVisible();
    await expect(archiveInput).toBeEnabled();
    if (testInfo.project.name !== 'Fold 6') {
      await expect(importTrigger).toBeFocused();
    }

    await openImportPane();
    await archiveInput.setInputFiles({
      name: 'database-export.zip',
      mimeType: 'application/zip',
      buffer: createDatabaseArchive(),
    });
    await expect(importDialog.getByRole('region', { name: 'Import details' })).toBeVisible();
    await expect(status).toHaveText('Preview ready.');
    await activate(importDialog.getByRole('button', { name: 'Close import dialog' }));
    await expect(status).toHaveText('Import cancelled.');
  } finally {
    releasePreview();
    await page.unroute('**/api/imports/preview');
    await deleteTestUser(request, user);
  }
});

test('Settings resolves import conflicts and refreshes a stale preview @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const ownerHeaders = {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };
  const names = {
    keep: `Keep ${randomUUID()}`,
    duplicate: `Duplicate ${randomUUID()}`,
    replace: `Replace ${randomUUID()}`,
    ambiguous: `Ambiguous ${randomUUID()}`,
  };
  const existingIds = {
    keep: await createPublication(request, config.apiUrl, ownerHeaders, names.keep, 'Local keep'),
    duplicate: await createPublication(
      request,
      config.apiUrl,
      ownerHeaders,
      names.duplicate,
      'Local duplicate',
    ),
    replace: await createPublication(
      request,
      config.apiUrl,
      ownerHeaders,
      names.replace,
      'Local replace',
    ),
    ambiguousFirst: await createPublication(
      request,
      config.apiUrl,
      ownerHeaders,
      names.ambiguous,
      'Local ambiguous first',
    ),
    ambiguousSecond: await createPublication(
      request,
      config.apiUrl,
      ownerHeaders,
      names.ambiguous,
      'Local ambiguous second',
    ),
  };
  const createdAt = new Date().toISOString();
  const incomingPublications = Object.entries(names).map(([kind, name]) => ({
    id: randomUUID(),
    publication_type: 'book',
    name,
    author: `Incoming ${kind}`,
    edition: null,
    isbn: null,
    retailer_url: null,
    site_url: null,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
    trashed_at: null,
  }));
  const archive = createDatabaseArchive(incomingPublications);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/settings');
    const dataManagement = page.getByRole('region', { name: 'Data management' });
    const importTrigger = dataManagement.getByRole('button', { name: 'Import database' });
    const importDialog = dataManagement.getByRole('dialog', { name: 'Import database' });
    const archiveInput = importDialog.getByLabel('Database archive');
    const status = dataManagement.locator('.database-import-feedback[role="status"]');

    const uploadAndPreview = async () => {
      await importTrigger.click();
      await expect(importDialog).toBeVisible();
      await archiveInput.setInputFiles({
        name: 'conflicting-database-export.zip',
        mimeType: 'application/zip',
        buffer: archive,
      });
      await expect(importDialog.locator('.database-import-feedback[role="status"]')).toHaveText(
        'Preview ready.',
      );
    };
    const chooseAction = async (action: 'keep' | 'replace') => {
      const label = action === 'replace' ? 'Replace existing entries' : 'Ignore existing entries';
      await importDialog.getByLabel(label).check();
    };
    const commitButton = importDialog.getByRole('button', { name: 'Import database' });
    const cancelButton = importDialog.getByRole('button', { name: 'Close import dialog' });

    await uploadAndPreview();
    await expect(commitButton).toBeDisabled();
    if (testInfo.project.name === 'Fold 6') {
      await cancelButton.tap();
    } else {
      await cancelButton.focus();
      await page.keyboard.press('Enter');
    }
    await expect(status).toHaveText('Import cancelled.');
    await expect(importDialog.getByRole('region', { name: 'Import details' })).toHaveCount(0);
    if (testInfo.project.name !== 'Fold 6') {
      await expect(importTrigger).toBeFocused();
    }
    const afterCancelResponse = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=id&account_id=eq.${user.id}`,
      { headers: ownerHeaders },
    );
    expect(afterCancelResponse.ok(), await afterCancelResponse.text()).toBeTruthy();
    expect(await afterCancelResponse.json()).toHaveLength(6);

    await uploadAndPreview();
    await chooseAction('replace');
    await expect(commitButton).toBeEnabled();

    const concurrentUpdate = await request.post(`${config.apiUrl}/rest/v1/rpc/update_publication`, {
      headers: ownerHeaders,
      data: {
        p_publication_id: existingIds.replace,
        p_expected_version: 1,
        p_name: names.replace,
        p_author: 'Concurrent edit',
        p_edition: null,
        p_isbn: null,
        p_retailer_url: null,
        p_site_url: null,
        p_tag_ids: [],
      },
    });
    expect(concurrentUpdate.ok(), await concurrentUpdate.text()).toBeTruthy();

    if (testInfo.project.name === 'Fold 6') {
      await commitButton.tap();
    } else {
      await commitButton.focus();
      await page.keyboard.press('Enter');
    }
    await expect(importDialog.getByRole('alert')).toHaveText(
      'A selected record changed. Preview the archive again.',
    );
    const refreshButton = importDialog.getByRole('button', { name: 'Refresh preview' });
    if (testInfo.project.name === 'Fold 6') {
      await refreshButton.tap();
    } else {
      await refreshButton.focus();
      await page.keyboard.press('Enter');
    }
    await expect(importDialog.locator('.database-import-feedback[role="status"]')).toHaveText(
      'Preview ready.',
    );
    await expect(commitButton).toBeDisabled();

    await chooseAction('replace');
    await expect(commitButton).toBeEnabled();
    if (testInfo.project.name === 'Fold 6') {
      await commitButton.tap();
    } else {
      await commitButton.focus();
      await page.keyboard.press('Enter');
    }
    await expect(importDialog).not.toBeVisible();
    await expect(dataManagement.getByRole('status')).toHaveText('Import complete.');

    const publicationsResponse = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=id,name,author&account_id=eq.${user.id}`,
      { headers: ownerHeaders },
    );
    expect(publicationsResponse.ok(), await publicationsResponse.text()).toBeTruthy();
    const publications = (await publicationsResponse.json()) as Array<{
      id: string;
      name: string;
      author: string | null;
    }>;
    expect(publications).toHaveLength(6);
    expect(publications).toContainEqual({
      id: existingIds.keep,
      name: names.keep,
      author: 'Incoming keep',
    });
    expect(publications).toContainEqual({
      id: existingIds.duplicate,
      name: names.duplicate,
      author: 'Incoming duplicate',
    });
    expect(publications).toContainEqual({
      id: existingIds.replace,
      name: names.replace,
      author: `Incoming replace`,
    });
    const ambiguousAuthors = publications
      .filter((publication) => publication.name === names.ambiguous)
      .map((publication) => publication.author);
    expect(ambiguousAuthors).toHaveLength(2);
    expect(ambiguousAuthors.filter((author) => author === 'Incoming ambiguous')).toHaveLength(1);
    expect(
      ambiguousAuthors.filter((author) =>
        ['Local ambiguous first', 'Local ambiguous second'].includes(author ?? ''),
      ),
    ).toHaveLength(1);
  } finally {
    await deleteTestUser(request, user);
  }
});
