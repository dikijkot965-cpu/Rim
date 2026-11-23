import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../src/application/message-list-renderer.js', import.meta.url), 'utf8');

test('message text is painted before asynchronous media hydration', () => {
  const paintIndex = source.indexOf('box.innerHTML = messages.map');
  const hydrateIndex = source.indexOf('void this.#hydrateImages');
  assert.ok(paintIndex >= 0 && hydrateIndex > paintIndex);
  assert.match(source, /withTimeout\(this\.\#loadProfiles/);
  assert.match(source, /5000, 'media_url_timeout'/);
});

test('message media hydration has bounded concurrency and preserves text fallback', () => {
  assert.match(source, /Math\.min\(3, messages\.length\)/);
  assert.match(source, /Вложение временно недоступно|Не удалось загрузить изображение/);
});
