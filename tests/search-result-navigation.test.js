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

test('main header retains Римъ and keeps search as the trailing control', async () => {
  const html = await read('../index.html');
  const start = html.indexOf('<header class="topbar">');
  const end = html.indexOf('</header>', start);
  assert.ok(start >= 0 && end > start);
  const topbar = html.slice(start, end);
  assert.match(topbar, /class="brand rim-topbar-brand"/);
  assert.match(topbar, /class="brand-title">Римъ<\/div>/);
  assert.ok(topbar.indexOf('rim-search-btn') > topbar.indexOf('rim-topbar-brand'));
  assert.match(html, /<div class="auth-logo">Римъ<\/div>/);
});

test('search mode hides the complete topbar and restores it when search closes', async () => {
  const search = await read('../src/application/search-controller.js');
  const page = await read('../src/application/shell-page-controller.js');
  assert.match(search, /classList\.add\('rim-search-open'\)/);
  assert.match(page, /classList\.remove\('rim-search-open'\)/);
  assert.match(await read('../assets/css/rim.css'), /#app\.rim-search-open > \.topbar\s*\{\s*display:none!important;/);
});
