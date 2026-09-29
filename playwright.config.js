import { defineConfig } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';

mkdirSync('.artifacts', { recursive: true });
const storage = mkdtempSync('.artifacts/test-kv-');

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:8789', channel: 'chrome', trace: 'off' },
  webServer: {
    command: `npm run dev -- --port 8789 --persist-to ${storage}`,
    url: 'http://localhost:8789/api/files',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
