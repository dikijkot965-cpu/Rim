import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelFeedController } from '../src/application/channel-feed-controller.js';
import { Ok, Err } from '../src/core/result.js';

function createShell(overrides = {}) {
  return {
    channel: {
      id: 'ch1',
      title: 'Новости <x>',
      description: 'Описание',
      username: 'news',
      is_public: true,
      owner_id: 'owner-1',
      avatar_path: null,
      ...(overrides.channel || {})
    },
    membership: overrides.membership === undefined ? { role: 'member' } : overrides.membership,
    posts: overrides.posts || [
      { id: 'p1', author_id: 'owner-1', body: 'Первый пост', created_at: '2026-01-01T00:00:00Z' }
    ],
    polls: overrides.polls || [],
    avatarUrl: overrides.avatarUrl || '',
    joined: overrides.joined !== undefined ? overrides.joined : true,
    role: overrides.role || 'member'
  };
}

function createDocument() {
  const bodyChildren = [];
  const body = {
    appendChild(node) { bodyChildren.push(node); },
    children: bodyChildren
  };
  const doc = {
    body,
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        innerHTML: '',
        isConnected: true,
        classList: { contains() { return false; }, toggle() { return true; } },
        querySelector(selector) {
          if (selector === '.rim-cf-scroll') {
            return {
              innerHTML: '',
              isConnected: true
            };
          }
          if (selector === '.rim-cf-feed-state') {
            return { textContent: '' };
          }
          return null;
        },
        addEventListener() {},
        removeEventListener() {},
        remove() {
          el.isConnected = false;
          const index = bodyChildren.indexOf(el);
          if (index >= 0) bodyChildren.splice(index, 1);
        }
      };
      return el;
    },
    getElementById(id) {
      return bodyChildren.find(node => node.id === id && node.isConnected !== false) || null;
    }
  };
  return doc;
}

test('ChannelFeedController opens shell then enrichment without inline ID handlers', async () => {
  const documentRef = createDocument();
  const shell = createShell();
  const repository = {
    getShell: async () => Ok(shell),
    getEnrichment: async () => Ok({
      reactions: [{ post_id: 'p1', user_id: 'u1', emoji: '👍' }],
      votes: [],
      profileById: { 'owner-1': { id: 'owner-1', username: 'tsar', display_name: 'Император' } }
    })
  };

  const controller = new ChannelFeedController({
    repository,
    getUser: () => ({ id: 'u1' }),
    documentRef,
    windowRef: { currentChannel: null },
    notify: () => {}
  });

  const result = await controller.open('ch1');
  assert.ok(result);
  assert.equal(documentRef.getElementById('rimChannelFull')?.id, 'rimChannelFull');
  const html = documentRef.getElementById('rimChannelFull').innerHTML;
  assert.match(html, /Новости &lt;x&gt;/);
  assert.match(html, /data-rim-cf-action="close"/);
  assert.doesNotMatch(html, /onclick="rimLeaveChannel/);
  controller.dispose();
});

test('ChannelFeedController discards stale open results', async () => {
  const documentRef = createDocument();
  let resolveShell;
  const repository = {
    getShell: () => new Promise(resolve => {
      resolveShell = () => resolve(Ok(createShell()));
    }),
    getEnrichment: async () => Ok({ reactions: [], votes: [], profileById: {} })
  };

  const controller = new ChannelFeedController({
    repository,
    getUser: () => ({ id: 'u1' }),
    documentRef,
    windowRef: {},
    notify: () => {}
  });

  const pending = controller.open('ch1');
  controller.invalidate();
  resolveShell();
  const result = await pending;
  assert.equal(result, null);
  assert.equal(documentRef.getElementById('rimChannelFull'), null);
});

test('ChannelFeedController surfaces shell errors', async () => {
  const messages = [];
  const controller = new ChannelFeedController({
    repository: { getShell: async () => Err(new Error('boom')) },
    getUser: () => ({ id: 'u1' }),
    documentRef: createDocument(),
    windowRef: {},
    notify: message => messages.push(message)
  });
  const result = await controller.open('ch1');
  assert.equal(result, null);
  assert.match(messages.join(' '), /boom/);
});

test('ChannelFeedController close removes the full-page section', async () => {
  const documentRef = createDocument();
  const controller = new ChannelFeedController({
    repository: {
      getShell: async () => Ok(createShell()),
      getEnrichment: async () => Ok({ reactions: [], votes: [], profileById: {} })
    },
    getUser: () => ({ id: 'u1' }),
    documentRef,
    windowRef: {},
    notify: () => {}
  });
  await controller.open('ch1');
  assert.ok(documentRef.getElementById('rimChannelFull'));
  controller.close();
  assert.equal(documentRef.getElementById('rimChannelFull'), null);
});
