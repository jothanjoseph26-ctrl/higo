const { defineConfig, devices } = require('@playwright/test');
const path = require('node:path');

const configDir = __dirname;
const workspaceRoot = path.resolve(configDir, '../..');
const apiUrl = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const baseURL = process.env.BASE_URL || 'http://localhost:4200';
const isCI = !!process.env.CI;

module.exports = defineConfig({
  testDir: './src',
  outputDir: 'test-output/playwright/output',
  reporter: [['html', { outputFolder: 'test-output/playwright/report', open: 'never' }]],
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  timeout: 60_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm exec nx serve @higo/api',
      url: `${apiUrl}/health`,
      reuseExistingServer: !isCI,
      cwd: workspaceRoot,
      timeout: 180_000,
    },
    {
      command: 'pnpm exec nx run @higo/admin-dashboard:dev',
      url: baseURL,
      reuseExistingServer: !isCI,
      cwd: workspaceRoot,
      timeout: 120_000,
      env: {
        VITE_API_URL: `${apiUrl}/api`,
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});