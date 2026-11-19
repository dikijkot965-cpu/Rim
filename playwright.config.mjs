/**
 * Playwright skeleton for RIM UI smoke.
 * Install: npm i -D @playwright/test && npx playwright install chromium
 * Run: npm run test:e2e
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.RIM_E2E_BASE_URL || 'http://127.0.0.1:4173',
    headless: true,
    trace: 'on-first-retry'
  },
  webServer: process.env.RIM_E2E_BASE_URL
    ? undefined
    : {
        command: 'python3 -m http.server 4173 --bind 127.0.0.1',
        port: 4173,
        reuseExistingServer: true,
        timeout: 15_000
      }
});
