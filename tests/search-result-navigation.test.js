import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('search delegates result clicks from the persistent results root', async () => {
  const source = await read('../src/application/search-controller.js');
  const bind = source.indexOf('this.#bindResultsRoot(out)');
  const render = source.indexOf('out.innerHTML = html ||');
  assert.ok(bind >= 0 && render > bind, 'bind the stable root before replacing its result children');
  assert.match(source, /root\.addEventListener\?\.\('click', this\.resultsClickHandler\)/);
  assert.match(source, /#onResultsClick\(event\)/);
  assert.match(source, /findUserByName\?\./);
  assert.match(source, /openChannel\?\./);
  assert.match(source, /openConversation\?\./);
  assert.match(source, /rimJoinPublicGroup\?\./);
  assert.doesNotMatch(source, /queueMicrotask/);
});

test('app header drops the decorative wordmark while authentication branding remains', async () => {
  const html = await read('../index.html');
  const start = html.indexOf('<header class="topbar">');
  const end = html.indexOf('</header>', start);
  assert.ok(start >= 0 && end > start);
  const topbar = html.slice(start, end);
  assert.doesNotMatch(topbar, /brand-title|Римъ/);
  assert.match(html, /<div class="auth-logo">Римъ<\/div>/);
});
