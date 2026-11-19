/**
 * Minimal shell smoke — loads the app and checks boot markers.
 * Requires @playwright/test (optional devDependency).
 */
import { test, expect } from '@playwright/test';

test.describe('RIM shell smoke', () => {
  test('index loads without console crash markers', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const hasAuthOrApp = await page.evaluate(() => {
      return !!(document.getElementById('authScreen') || document.getElementById('app'));
    });
    expect(hasAuthOrApp).toBeTruthy();
    const fatal = errors.filter((e) => /Dependency not registered|SyntaxError/i.test(e));
    expect(fatal, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('runtime smoke harness sets rimReady when modular loads', async ({ page }) => {
    await page.goto('/tests/runtime-smoke.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body?.dataset?.rimReady != null, null, { timeout: 20_000 });
    const ready = await page.evaluate(() => document.body.dataset.rimReady);
    expect(ready).toBe('true');
  });
});
