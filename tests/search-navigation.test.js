import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchController } from '../src/application/search-controller.js';

test('search result clicks are delegated after results are rendered', async () => {
  const handlers = {};
  const out = {
    innerHTML: '',
    addEventListener(type, handler) { handlers[type] = handler; },
    removeEventListener() {},
    contains() { return true; }
  };
  const input = { value: 'alex' };
  const documentRef = {
    getElementById(id) { return id === 'rimSearchResults' ? out : id === 'rimSearchInput' ? input : null; },
    querySelectorAll() { return []; }
  };
  const query = {
    select() { return this; },
    or() { return this; },
    limit() { return Promise.resolve({ data: [{ id: 'u1', username: 'alex', display_name: 'Alex' }], error: null }); }
  };
  const client = { from(table) { assert.equal(table, 'profiles'); return query; } };
  const navigated = [];
  const windowRef = { closePage() {}, findUserByName(username) { navigated.push(username); } };
  const controller = new SearchController({ client, documentRef, windowRef });
  controller.kind = 'users';
  await controller.run();
  assert.match(out.innerHTML, /data-rim-search-user="alex"/);
  assert.equal(typeof handlers.click, 'function');
  const userNode = { getAttribute(name) { return name === 'data-rim-search-user' ? 'alex' : null; } };
  handlers.click({
    target: { closest(selector) { return selector === '[data-rim-search-user]' ? userNode : null; } },
    preventDefault() {}
  });
  assert.deepEqual(navigated, ['alex']);
  controller.dispose();
});
