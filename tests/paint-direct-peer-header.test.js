import test from 'node:test';
import assert from 'node:assert/strict';
import { paintDirectPeerHeader } from '../src/application/paint-direct-peer-header.js';

test('paintDirectPeerHeader skips non-direct conversations', async () => {
  const result = await paintDirectPeerHeader({
    conversation: { id: 'g1', type: 'group' },
    resolveChatHeader: async () => ({ title: 'x', peer: null })
  });
  assert.equal(result, null);
});

test('paintDirectPeerHeader paints title and online status', async () => {
  const nodes = {
    chatHeadName: { textContent: '' },
    chatHeadStatus: { textContent: '' },
    chatHeadAvatar: { textContent: '' }
  };
  const peer = {
    id: 'p1',
    display_name: 'Адмирал',
    last_seen_at: new Date().toISOString(),
    showOnline: true
  };
  const result = await paintDirectPeerHeader({
    conversation: { id: 'c1', type: 'direct', title: 'x', other_profile: peer },
    user: { id: 'u1' },
    repository: {},
    resolveChatHeader: async () => ({ title: 'Адмирал', peer }),
    applyPeerAvatar: async () => null,
    documentRef: { getElementById: id => nodes[id] || null },
    isCurrent: () => true
  });
  assert.equal(result.title, 'Адмирал');
  assert.equal(nodes.chatHeadName.textContent, 'Адмирал');
  assert.equal(nodes.chatHeadStatus.textContent, 'В сети');
});
