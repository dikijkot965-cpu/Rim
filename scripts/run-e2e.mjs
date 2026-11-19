#!/usr/bin/env node
/**
 * Optional e2e runner: skips cleanly if Playwright is not installed.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
try {
  require.resolve('@playwright/test');
} catch {
  console.log('[@playwright/test] not installed — skip e2e (npm i -D @playwright/test && npx playwright install chromium)');
  process.exit(0);
}

const result = spawnSync('npx', ['playwright', 'test'], {
  stdio: 'inherit',
  shell: true
});
process.exit(result.status ?? 1);
