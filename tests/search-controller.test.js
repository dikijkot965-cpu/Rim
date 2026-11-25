import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchController } from '../src/application/search-controller.js';

test('open paints search page shell', () => {
  const pages = [];
  const documentRef = {
    getElementById() { return null; },
    querySelectorAll() { return []; }
  };
  const controller = new SearchController({
    client: {},
    documentRef,
    windowRef: {},
    openPage: (title, html) => pages.push({ title, html })
  });
  controller.open();
  assert.equal(pages[0].title, 'Поиск в РИМе');
  assert.match(pages[0].html, /rimSearchInput/);
  assert.match(pages[0].html, /data-rim-search-kind="users"/);
  assert.match(pages[0].html, /data-rim-search-kind="messages"/);
  controller.dispose();
});

test('run renders empty state for short query', async () => {
  const out = { innerHTML: '' };
  const documentRef = {
    getElementById(id) {
      if (id === 'rimSearchResults') return out;
      if (id === 'rimSearchInput') return { value: 'a' };
      return null;
    },
    querySelectorAll() { return []; }
  };
  const controller = new SearchController({
    client: {},
    documentRef,
    windowRef: {}
  });
  await controller.run();
  assert.match(out.innerHTML, /не менее двух/);
  controller.dispose();
});
