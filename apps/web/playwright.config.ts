import { defineConfig, devices } from '@playwright/test';

/**
 * UI smoke tests. Expects the stack to be running (`npm run dev` from the repo root:
 * API on :4000, worker, web on :3000) with Postgres/Redis from docker compose.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
