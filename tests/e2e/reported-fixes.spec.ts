import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

test('recipe sections share bounded gutters and nested instructions preserve photo widths @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const user = await createTestUser(request);
  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/recipes/new');
    await page.getByLabel('Name', { exact: true }).fill('Reported fixes recipe');
    await page.getByLabel('Serves', { exact: true }).fill('4');
    await page
      .getByRole('table', { name: 'Recipe ingredients', exact: true })
      .getByRole('cell', { name: 'Add ingredient row' })
      .click();
    const ingredient = page.getByRole('combobox', { name: 'Ingredient, row 1', exact: true });
    await ingredient.fill('Layout flour');
    await ingredient.press('Enter');
    await ingredient.press('Enter');
    await page.getByLabel('Notes (Markdown)').fill('Keep the outer edges consistent.');
    await page
      .getByRole('textbox', { name: 'Instruction step 1' })
      .fill(
        '- fix title shrinkage\n- but also fix huge buttons\n  - at least, import/export can be one button\n    - also, this and the item above it should be indented.\n- also, that image to the right does not look 800px wide',
      );
    await page.getByRole('button', { name: 'Edit recipe nutrition' }).click();
    const nutritionPane = page.getByRole('dialog', { name: 'Nutrition for This recipe' });
    await nutritionPane.getByLabel('Calories', { exact: true }).fill('475');
    await nutritionPane.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Reported fixes recipe' })).toBeVisible();
    const recipeUrl = page.url();

    await page.screenshot({
      path: testInfo.outputPath('reader-before-layout-check.png'),
      fullPage: true,
    });
    for (const width of [2560, 1920, 1280, 960, 761, 760, 640, 384]) {
      await page.setViewportSize({ width, height: 900 });
      const bounds = await page.evaluate(() => {
        const content = document.querySelector('.private-content');
        const reading = document.querySelector('.recipe-reading-layout');
        const notes = document.querySelector('.recipe-notes-nutrition');
        if (!content || !reading || !notes) throw new Error('Missing recipe layout groups.');
        const outer = content.getBoundingClientRect();
        const reader = reading.getBoundingClientRect();
        const lower = notes.getBoundingClientRect();
        return {
          left: reader.left - outer.left,
          right: outer.right - reader.right,
          leftDelta: Math.abs(reader.left - lower.left),
          rightDelta: Math.abs(reader.right - lower.right),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(bounds.left).toBeLessThanOrEqual(97);
      expect(bounds.right).toBeLessThanOrEqual(97);
      expect(bounds.leftDelta).toBeLessThanOrEqual(1);
      expect(bounds.rightDelta).toBeLessThanOrEqual(1);
      expect(bounds.overflow).toBeLessThanOrEqual(0);
    }
    await expect(
      page.locator('.recipe-instruction-list > li > ul > li > ul > li > ul > li'),
    ).toHaveText('also, this and the item above it should be indented.');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${recipeUrl}/edit`);
    await page.getByRole('button', { name: 'Manage recipe photos' }).click();
    const photos = page.getByRole('dialog', { name: 'Manage recipe photos' });
    const image = await sharp({
      create: { width: 1000, height: 300, channels: 3, background: '#bfd8ab' },
    })
      .png()
      .toBuffer();
    await photos.getByLabel('Upload from device', { exact: true }).setInputFiles({
      name: 'wide-instruction.png',
      mimeType: 'image/png',
      buffer: image,
    });
    await expect(photos.locator('.recipe-photo-grid-item')).toHaveCount(1);
    await photos.getByRole('button', { name: 'Done', exact: true }).click();
    await page.reload();
    const instruction = page.getByRole('textbox', { name: 'Instruction step 1' });
    const text = await instruction.inputValue();
    await instruction.fill('+p');
    const choice = page.getByRole('button', { name: /^Insert photo \d{2}$/ }).first();
    await expect(choice).toBeVisible();
    const photoCode = (await choice.getAttribute('aria-label'))?.match(/\d{2}$/)?.[0];
    if (!photoCode) throw new Error('Expected the photo reference code.');
    await choice.click();
    await instruction.fill(`+photo${photoCode}-w800\n${text}`);
    await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
    await expect(page).toHaveURL(recipeUrl);
    await page.getByRole('switch', { name: 'Make linkable' }).click();
    const usernameDialog = page.getByRole('dialog', { name: 'Choose a public username' });
    await usernameDialog.getByLabel('Public username').fill(`reported-${user.id.slice(0, 8)}`);
    await usernameDialog.getByRole('button', { name: 'Save username & publish' }).click();
    await expect(usernameDialog).toBeHidden();
    for (const width of [900, 761, 760, 641, 640, 639, 560, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const toggle = page.getByRole('switch', { name: 'Make private' });
      expect((await toggle.boundingBox())?.width).toBeLessThanOrEqual(84);
      if (width === 640 || width === 390) {
        await page.screenshot({
          path: testInfo.outputPath(`sharing-toolbar-${width}.png`),
          fullPage: true,
        });
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    }
    for (const width of [1920, 1100, 800, 640, 384]) {
      await page.setViewportSize({ width, height: 1080 });
      const photo = page.locator('.recipe-instruction-photo');
      await expect(photo).toBeVisible();
      const geometry = await photo.evaluate((element) => {
        const available = element.closest('li')?.getBoundingClientRect().width;
        if (!available) throw new Error('Missing instruction width.');
        return { width: element.getBoundingClientRect().width, available };
      });
      expect(geometry.width).toBeCloseTo(Math.min(800, geometry.available), 0);
    }
    await page.screenshot({ path: testInfo.outputPath('reader-mobile.png'), fullPage: true });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.screenshot({ path: testInfo.outputPath('reader-desktop.png'), fullPage: true });
    await page.goto(`${recipeUrl}/edit`);
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      `+photo${photoCode}-w800\n${text}`,
    );
    const config = await getLocalSupabaseConfig();
    const recipeId = new URL(recipeUrl).pathname.split('/').at(-1);
    const response = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=public_id&id=eq.${recipeId}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${user.accessToken}` } },
    );
    expect(response.ok(), await response.text()).toBeTruthy();
    const [recipe] = (await response.json()) as Array<{ public_id: string }>;
    if (!recipe?.public_id) throw new Error('Expected the recipe public ID.');
    await page.addInitScript(() => {
      window.print = () => {
        const nested = document.querySelector(
          '.recipe-instruction-list > li > ul > li > ul > li > ul > li',
        );
        const photos = Array.from(document.querySelectorAll('.recipe-instruction-photo'));
        const bounded =
          photos.length > 0 &&
          photos.every((photo) => {
            const parent = photo.parentElement;
            return (
              parent &&
              photo.getBoundingClientRect().width <= parent.getBoundingClientRect().width + 1
            );
          });
        window.top?.document.documentElement.setAttribute(
          'data-reported-fixes-print',
          String(Boolean(nested) && bounded),
        );
        window.dispatchEvent(new Event('afterprint'));
      };
    });
    await page.goto(`/r/${recipe.public_id}`);
    for (const width of [2560, 1920, 960, 760, 384]) {
      await page.setViewportSize({ width, height: 1080 });
      await expect(page.locator('.recipe-instruction-photo')).toBeVisible();
      const photoSize = await page.locator('.recipe-instruction-photo').evaluate((photo) => {
        const available = photo.closest('li')?.getBoundingClientRect().width;
        if (!available) throw new Error('Missing public instruction width.');
        return { width: photo.getBoundingClientRect().width, available };
      });
      expect(photoSize.width).toBeCloseTo(Math.min(800, photoSize.available), 0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      const bounds = await page.evaluate(() => {
        const main = document.querySelector('main');
        const groups = ['.recipe-reading-layout', '.recipe-notes-nutrition'].map((selector) =>
          document.querySelector(selector),
        );
        if (!main || groups.some((group) => !group)) throw new Error('Missing public layout.');
        const outer = main.getBoundingClientRect();
        return groups.map((group) => {
          if (!group) throw new Error('Missing public section.');
          const rect = group.getBoundingClientRect();
          return { left: rect.left - outer.left, right: outer.right - rect.right };
        });
      });
      for (const group of bounds) {
        expect(group.left).toBeLessThanOrEqual(97);
        expect(group.right).toBeLessThanOrEqual(97);
        expect(group.left).toBeCloseTo(bounds[0].left, 0);
        expect(group.right).toBeCloseTo(bounds[0].right, 0);
      }
      await expect(
        page.locator('.recipe-instruction-list > li > ul > li > ul > li > ul > li'),
      ).toHaveText('also, this and the item above it should be indented.');
      await page.screenshot({
        path: testInfo.outputPath(`public-reader-${width}.png`),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Download HTML' }).click();
    await expect(page.locator('.recipe-output-feedback-success')).toHaveText(
      'HTML download started.',
    );
    const download = await downloadPromise;
    const path = await download.path();
    if (!path) throw new Error('Expected standalone HTML download.');
    const output = await page.context().newPage();
    try {
      await output.setContent(await readFile(path, 'utf8'));
      await expect(
        output.locator('.recipe-instruction-list > li > ul > li > ul > li > ul > li'),
      ).toHaveText('also, this and the item above it should be indented.');
      for (const width of [1100, 384]) {
        await output.setViewportSize({ width, height: 900 });
        expect(
          await output.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        ).toBe(true);
      }
    } finally {
      await output.close();
    }
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-reported-fixes-print', 'true');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('editor explains Main and gives empty Preparation a usable width with left-aligned footer @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recipes/new');
    await page.getByLabel('Name', { exact: true }).fill('Editor repair recipe');
    await page
      .getByRole('table', { name: 'Recipe ingredients', exact: true })
      .getByRole('cell', { name: 'Add ingredient row' })
      .click();
    const ingredient = page.getByRole('combobox', { name: 'Ingredient, row 1', exact: true });
    await ingredient.fill('Repair flour');
    await ingredient.press('Enter');
    await ingredient.press('Enter');
    const main = page.getByRole('checkbox', { name: 'Main, row 1', exact: true });
    await expect(main).toHaveAccessibleDescription(/main ingredient.*search/i);
    await page.getByRole('cell', { name: 'Preparation, row 1', exact: true }).click();
    const preparation = page.getByRole('combobox', { name: 'Preparation, row 1', exact: true });
    expect((await preparation.boundingBox())?.width).toBeGreaterThan(60);
    await page.screenshot({ path: testInfo.outputPath('preparation-desktop.png'), fullPage: true });
    await preparation.fill('finely chopped');
    await preparation.press('Enter');
    await preparation.press('Enter');
    await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Editor repair recipe' })).toBeVisible();
    await page.goto(`${page.url()}/edit`);
    const footer = page.locator('.recipe-form-actions');
    const cancel = footer.getByRole('link', { name: 'Cancel', exact: true });
    const footerBox = await footer.boundingBox();
    const cancelBox = await cancel.boundingBox();
    expect(cancelBox?.x).toBeCloseTo(footerBox?.x ?? -1, 0);
    const addReference = await page
      .getByRole('button', { name: 'Add reference', exact: true })
      .boundingBox();
    expect(
      (footerBox?.y ?? 0) - ((addReference?.y ?? 0) + (addReference?.height ?? 0)),
    ).toBeGreaterThanOrEqual(18);
    await expect(footer.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Preparation, row 1', exact: true })).toHaveText(
      'finely chopped',
    );
    await page.screenshot({ path: testInfo.outputPath('editor-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 384, height: 900 });
    await expect(
      page.getByRole('checkbox', { name: 'Main, row 1', exact: true }),
    ).toHaveAccessibleDescription(/main ingredient.*search/i);
    await expect(
      page.getByText('Main marks an ingredient for main-ingredient searches.'),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('editor-mobile.png'), fullPage: true });
  } finally {
    await deleteTestUser(request, user);
  }
});
