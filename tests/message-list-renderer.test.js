import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessageArticleHtml, renderMentionsHtml, MessageListRenderer } from '../src/application/message-list-renderer.js';

test('message article escapes body and marks own messages', () => {
  const html = buildMessageArticleHtml({
    id: 'm1',
    sender_id: 'u1',
    body: '<script>x</script> hello @ivan',
    created_at: '2026-01-01T12:00:00Z'
  }, {
    currentUserId: 'u1',
    profiles: {},
    messages: []
  });
  assert.match(html, /class="message mine"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-rim-msg="1"/);
  assert.doesNotMatch(html, /onclick="setReply/);
});

test('mentions become delegated actions', () => {
  const html = renderMentionsHtml('hi @bob');
  assert.match(html, /data-rim-msg-action="find-user"/);
  assert.match(html, /data-username="bob"/);
});

test('renderer paints empty state when no messages', async () => {
  const box = { innerHTML: '', scrollHeight: 0, scrollTop: 0, clientHeight: 0, addEventListener() {}, removeEventListener() {}, contains() { return true; } };
  const documentRef = {
    getElementById(id) { return id === 'messages' ? box : null; }
  };
  const renderer = new MessageListRenderer({
    client: { from() { return { select() { return this; }, in() { return Promise.resolve({ data: [], error: null }); } }; }, storage: { from() { return { createSignedUrl: async () => ({ data: null }) }; } } },
    getUser: () => ({ id: 'u1' }),
    getMessages: () => [],
    documentRef,
    windowRef: {}
  });
  await renderer.render();
  assert.match(box.innerHTML, /пока нет сообщений/);
  renderer.dispose();
});
