import { defineConfig, devices } from '@playwright/test';
import { fold6Preset } from './playwright.fold6';

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: externalBaseUrl ?? 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Fold 6',
      use: {
        ...fold6Preset,
      },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npm run dev:test',
        env: { CRON_SECRET: 'slice12-local-test-only' },
        url: 'http://localhost:3001',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
