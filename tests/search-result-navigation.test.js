import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = () => readFile(new URL('../src/application/search-controller.js', import.meta.url), 'utf8');

test('search result actions are delegated after the result markup is inserted', async () => {
  const code = await source();
  const insertion = code.indexOf('out.innerHTML = html ||');
  const binding = code.indexOf('this.#bindResultActions(out)', insertion);
  assert.ok(insertion >= 0 && binding > insertion, 'bind delegated actions only after rendering results');
  assert.match(code, /root\.addEventListener\('click'/);
  assert.match(code, /\[data-rim-search-user\], \[data-rim-search-channel\], \[data-rim-search-conversation\], \[data-rim-join-group\]/);
  assert.match(code, /findUserByName\?\./);
  assert.match(code, /openChannel\?\./);
  assert.match(code, /openConversation\?\./);
  assert.match(code, /rimJoinPublicGroup\?\./);
  assert.doesNotMatch(code, /queueMicrotask/);
});

test('user and channel search results are semantic keyboard-accessible buttons', async () => {
  const code = await source();
  assert.match(code, /<button type="button" class="rim-search-result" data-rim-search-user=/);
  assert.match(code, /<button type="button" class="rim-search-result" data-rim-search-channel=/);
});
