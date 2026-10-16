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

function createDatabaseArchive(publications: PortableData['records']['publications'] = []) {
  const data: PortableData = {
    format: 'recipe-box-data',
    schema_version: 1,
    scope: { type: 'database' },
    account_preferences: {},
    records: Object.fromEntries(
      exportTableNames.map((table) => [table, []]),
    ) as unknown as PortableData['records'],
  };
  data.records.publications = publications;
  const dataBytes = strToU8(JSON.stringify(data));
  const manifest = buildBundleManifest(
    { type: 'database' },
    [{ path: 'data.json', bytes: dataBytes }],
    '0.1.0',
    new Date(),
  );
  return Buffer.from(
    zipSync({
      'data.json': dataBytes,
      'manifest.json': strToU8(JSON.stringify(manifest)),
    }),
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
  await expect(page).toHaveURL(/\/recipes$/);
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

    const dataManagement = page.getByRole('region', { name: 'Data management' });
    const importAction = dataManagement.getByRole('button', { name: 'Preview import' });
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
      buffer: createDatabaseArchive(),
    });
    if (testInfo.project.name === 'Fold 6') {
      expect((await importAction.boundingBox())?.height).toBeGreaterThanOrEqual(48);
      await importAction.tap();
    } else {
      await importAction.click();
    }

    const preview = dataManagement.getByRole('region', { name: 'Import preview' });
    await expect(preview.getByRole('heading', { name: 'Import preview' })).toBeVisible();
    await expect(dataManagement.locator('.database-import-feedback[role="status"]')).toHaveText(
      'Preview ready.',
    );
    await expect(dataManagement.getByRole('button', { name: 'Import database' })).toBeEnabled();

    if (testInfo.project.name === 'chromium') {
      const previewAccessibility = await new AxeBuilder({ page })
        .include('.settings-data-management')
        .analyze();
      expect(previewAccessibility.violations).toEqual([]);
    }
    if (testInfo.project.name === 'Fold 6') {
      await expectNoHorizontalOverflow(page);
    }

    const commitButton = dataManagement.getByRole('button', { name: 'Import database' });
    if (testInfo.project.name === 'Fold 6') {
      await commitButton.tap();
    } else {
      await commitButton.click();
    }
    await expect(dataManagement.locator('.database-import-feedback[role="status"]')).toHaveText(
      'Import complete.',
    );
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
    const archiveInput = page.getByLabel('Database archive');
    const status = dataManagement.locator('.database-import-feedback[role="status"]');
    const activate = async (button: import('@playwright/test').Locator) => {
      if (testInfo.project.name === 'Fold 6') {
        await button.tap();
      } else {
        await button.focus();
        await expect(button).toHaveCSS('outline-style', 'solid');
        await page.keyboard.press('Enter');
      }
    };

    await archiveInput.setInputFiles({
      name: 'invalid-database-export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('not a zip archive'),
    });
    await activate(dataManagement.getByRole('button', { name: 'Preview import' }));
    await previewRequested;
    await expect(dataManagement.getByLabel('Import preparation')).toBeVisible();
    releasePreview();

    const alert = dataManagement.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/\S/);
    await expect(alert).not.toContainText('recipe-exports');
    await activate(dataManagement.getByRole('button', { name: 'Cancel import' }));
    await expect(status).toHaveText('Import cancelled.');
    await expect(archiveInput).toBeEnabled();
    if (testInfo.project.name !== 'Fold 6') await expect(archiveInput).toBeFocused();

    await archiveInput.setInputFiles({
      name: 'database-export.zip',
      mimeType: 'application/zip',
      buffer: createDatabaseArchive(),
    });
    await activate(dataManagement.getByRole('button', { name: 'Preview import' }));
    await expect(dataManagement.getByRole('region', { name: 'Import preview' })).toBeVisible();
    await expect(status).toHaveText('Preview ready.');
    await activate(dataManagement.getByRole('button', { name: 'Cancel import' }));
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
    const archiveInput = page.getByLabel('Database archive');

    const uploadAndPreview = async () => {
      await archiveInput.setInputFiles({
        name: 'conflicting-database-export.zip',
        mimeType: 'application/zip',
        buffer: archive,
      });
      const previewButton = dataManagement.getByRole('button', { name: 'Preview import' });
      if (testInfo.project.name === 'Fold 6') {
        await previewButton.tap();
      } else {
        await previewButton.focus();
        await page.keyboard.press('Enter');
      }
      await expect(dataManagement.locator('.database-import-feedback[role="status"]')).toHaveText(
        'Preview ready.',
      );
    };
    const conflict = (name: string) =>
      dataManagement.locator('.database-import-conflicts > li').filter({ hasText: name });
    const chooseAction = async (name: string, action: 'keep' | 'duplicate' | 'replace') => {
      const select = conflict(name).getByLabel(`Import choice for ${name}`);
      if (testInfo.project.name === 'Fold 6') {
        await select.selectOption(action);
        return;
      }
      await select.focus();
      await expect(select).toHaveCSS('outline-style', 'solid');
      const arrowPresses = { keep: 1, duplicate: 2, replace: 3 }[action];
      for (let index = 0; index < arrowPresses; index += 1) {
        await page.keyboard.press('ArrowDown');
      }
      await page.keyboard.press('Enter');
    };
    const commitButton = dataManagement.getByRole('button', { name: 'Import database' });
    const cancelButton = dataManagement.getByRole('button', { name: 'Cancel import' });

    await uploadAndPreview();
    await expect(commitButton).toBeDisabled();
    if (testInfo.project.name === 'Fold 6') {
      await cancelButton.tap();
    } else {
      await cancelButton.focus();
      await page.keyboard.press('Enter');
    }
    await expect(dataManagement.locator('.database-import-feedback[role="status"]')).toHaveText(
      'Import cancelled.',
    );
    await expect(dataManagement.getByRole('region', { name: 'Import preview' })).toHaveCount(0);
    if (testInfo.project.name !== 'Fold 6') await expect(archiveInput).toBeFocused();
    const afterCancelResponse = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=id&account_id=eq.${user.id}`,
      { headers: ownerHeaders },
    );
    expect(afterCancelResponse.ok(), await afterCancelResponse.text()).toBeTruthy();
    expect(await afterCancelResponse.json()).toHaveLength(6);

    await uploadAndPreview();
    await chooseAction(names.keep, 'keep');
    await chooseAction(names.duplicate, 'duplicate');
    await chooseAction(names.replace, 'replace');
    await chooseAction(names.ambiguous, 'keep');
    const ambiguousTarget = conflict(names.ambiguous).getByLabel('Existing match');
    const selectedAmbiguousId = await ambiguousTarget
      .locator('option')
      .nth(2)
      .getAttribute('value');
    await expect(commitButton).toBeDisabled();
    if (testInfo.project.name === 'Fold 6') {
      await ambiguousTarget.selectOption(selectedAmbiguousId ?? '');
    } else {
      await ambiguousTarget.focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    }
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
    await expect(dataManagement.getByRole('alert')).toHaveText(
      'A selected record changed. Preview the archive again.',
    );
    const refreshButton = dataManagement.getByRole('button', { name: 'Refresh preview' });
    if (testInfo.project.name === 'Fold 6') {
      await refreshButton.tap();
    } else {
      await refreshButton.focus();
      await page.keyboard.press('Enter');
    }
    await expect(dataManagement.locator('.database-import-feedback[role="status"]')).toHaveText(
      'Preview ready.',
    );
    await expect(commitButton).toBeDisabled();

    await chooseAction(names.keep, 'keep');
    await chooseAction(names.duplicate, 'duplicate');
    await chooseAction(names.replace, 'replace');
    await chooseAction(names.ambiguous, 'keep');
    if (testInfo.project.name === 'Fold 6') {
      await ambiguousTarget.selectOption(selectedAmbiguousId ?? '');
    } else {
      await ambiguousTarget.focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    }
    await expect(commitButton).toBeEnabled();
    if (testInfo.project.name === 'Fold 6') {
      await commitButton.tap();
    } else {
      await commitButton.focus();
      await page.keyboard.press('Enter');
    }
    await expect(dataManagement.locator('.database-import-feedback[role="status"]')).toHaveText(
      'Import complete.',
    );

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
    expect(publications).toHaveLength(7);
    expect(publications).toContainEqual({
      id: existingIds.keep,
      name: names.keep,
      author: 'Local keep',
    });
    expect(publications).toContainEqual({
      id: existingIds.replace,
      name: names.replace,
      author: `Incoming replace`,
    });
    expect(publications).toContainEqual({
      name: `${names.duplicate} (Imported)`,
      author: 'Incoming duplicate',
      id: expect.any(String),
    });
    expect(publications).toContainEqual({
      id: selectedAmbiguousId,
      name: names.ambiguous,
      author:
        selectedAmbiguousId === existingIds.ambiguousFirst
          ? 'Local ambiguous first'
          : 'Local ambiguous second',
    });
  } finally {
    await deleteTestUser(request, user);
  }
});
