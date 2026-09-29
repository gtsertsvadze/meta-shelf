import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:8787', channel: 'chrome', trace: 'off' },
  webServer: {
    command: 'npm run dev -- --port 8787',
    url: 'http://localhost:8787/api/files',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
