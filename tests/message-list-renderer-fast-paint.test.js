import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageListRenderer } from '../src/application/message-list-renderer.js';

test('message timeline paints before a slow profile lookup resolves', async () => {
  let resolveProfiles;
  const profileRequest = new Promise(resolve => { resolveProfiles = resolve; });
  const box = {
    innerHTML: '',
    scrollHeight: 40,
    scrollTop: 0,
    clientHeight: 40,
    isConnected: true,
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; }
  };
  const client = {
    from() {
      const query = {
        select() { return query; },
        in() { return profileRequest; }
      };
      return query;
    },
    storage: { from() { return { createSignedUrl: async () => ({ data: null, error: null }) }; } }
  };
  const renderer = new MessageListRenderer({
    client,
    getUser: () => ({ id: 'u1' }),
    getMessages: () => [{
      id: 'm1', conversation_id: 'c1', sender_id: 'u1',
      body: 'Отображается сразу', created_at: '2026-01-01T12:00:00Z'
    }],
    documentRef: { getElementById: id => id === 'messages' ? box : null },
    windowRef: {}
  });

  const render = renderer.render();
  assert.match(box.innerHTML, /Отображается сразу/);
  resolveProfiles({ data: [], error: null });
  await render;
  await new Promise(resolve => setImmediate(resolve));
  renderer.dispose();
});
