import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', timeout: 45000, workers: 1, use: { baseURL: process.env.TEST_URL || 'http://127.0.0.1:4173', headless: true }, webServer: process.env.TEST_URL ? undefined : { command: 'pnpm preview --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: true } });
