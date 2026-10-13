import type { Page } from '@playwright/test';
import { test } from '@playwright/test';

export async function captureScreenshot(page: Page, name: string) {
  const path = test.info().outputPath(`${name}.png`);
  await page.screenshot({ fullPage: true, path });
  await test.info().attach(name, { contentType: 'image/png', path });
}
