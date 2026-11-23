import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('ChannelFeedController loads older posts with bounded cursor pagination', async () => {
  const documentRef = createDocument();
  const shell = createShell({ posts: [
    { id: 'p2', author_id: 'owner-1', body: 'Newer', created_at: '2026-01-02T00:00:00Z' }
  ] });
  const repository = {
    postLimit: 30,
    getShell: async () => Ok({ ...shell, hasMorePosts: true }),
    getEnrichment: async ({ postIds = [] } = {}) => Ok({
      reactions: postIds.map(post_id => ({ post_id, user_id: 'u1', emoji: '👍' })),
      votes: [],
      profileById: { 'owner-1': { username: 'owner' } }
    }),
    getOlderPosts: async () => Ok([
      { id: 'p1', author_id: 'owner-1', body: 'Older', created_at: '2026-01-01T00:00:00Z' }
    ])
  };
  const controller = new ChannelFeedController({
    repository, getUser: () => ({ id: 'u1' }), documentRef,
    windowRef: {}, notify: () => {}
  });
  await controller.open('ch1');
  assert.equal(controller.feedState.posts.length, 1);
  await controller.loadOlderPosts(null);
  assert.deepEqual(controller.feedState.posts.map(post => post.id), ['p2', 'p1']);
  assert.equal(controller.feedState.reactions.length, 2);
  assert.equal(controller.feedState.hasMorePosts, false);
  controller.dispose();
});


test('ChannelFeedController pins a channel post and updates the pinned read model', async () => {
  const documentRef = createDocument();
  const shell = createShell({
    membership: { role: 'admin' },
    posts: [{ id: 'p1', author_id: 'owner-1', body: 'Pinned text', created_at: '2026-01-01T00:00:00Z', is_pinned: false }],
    pinnedPosts: []
  });
  const repository = {
    getShell: async () => Ok(shell),
    getEnrichment: async () => Ok({ reactions: [], votes: [], profileById: { 'owner-1': { username: 'owner' } } }),
    pinPost: async (_postId, pinned) => Ok(pinned)
  };
  const controller = new ChannelFeedController({
    repository, getUser: () => ({ id: 'owner-1' }), documentRef,
    windowRef: {}, notify: () => {}
  });
  await controller.open('ch1');
  await controller.togglePinnedPost(null, 'p1');
  assert.equal(controller.feedState.posts[0].is_pinned, true);
  assert.equal(controller.feedState.pinnedPosts[0].id, 'p1');
  controller.dispose();
});

test('pinned channel summary can jump to its corresponding feed post', () => {
  const source = fs.readFileSync(new URL('../src/application/channel-feed-controller.js', import.meta.url), 'utf8');
  assert.match(source, /data-rim-cf-action="goto-post"/);
  assert.match(source, /case 'goto-post'/);
  assert.match(source, /scrollIntoView/);
});

test('channel feed renders manager shortcuts and separates manager metrics from subscriber view', async () => {
  const documentRef = createDocument();
  const shell = createShell({ channel: { discussion_conversation_id: 'discussion-1' } });
  shell.memberCount = 106; shell.managerCount = 3;
  const repository = { getShell: async () => Ok(shell), getEnrichment: async () => Ok({ reactions: [], votes: [], profileById: {} }) };
  const controller = new ChannelFeedController({ repository, getUser: () => ({ id: 'owner-1' }), documentRef, windowRef: {}, notify: () => {} });
  await controller.open('ch1');
  const html = documentRef.getElementById('rimChannelFull').innerHTML;
  assert.match(html, /106/);
  assert.match(html, /3 администраторов/);
  assert.match(html, /data-rim-cf-action=\"invite\"/);
  assert.match(html, /data-rim-cf-action=\"new-post\"/);
  assert.match(html, /data-rim-cf-action=\"discussion\"/);
  controller.dispose();
});

test('channel composer supports image attachment and admin post edit/delete/share actions', () => {
  const source = fs.readFileSync(new URL('../src/application/channel-feed-controller.js', import.meta.url), 'utf8');
  assert.match(source, /rimChannelPostMedia/);
  assert.match(source, /storage\.from\('chat-files'\)\.upload/);
  assert.match(source, /data-rim-cf-action="edit-post"/);
  assert.match(source, /data-rim-cf-action="delete-post"/);
  assert.match(source, /data-rim-cf-action="share-post"/);
});

test('channel admin tabs load actual requests and scheduled queue actions', () => {
  const source = fs.readFileSync(new URL('../src/application/channel-feed-controller.js', import.meta.url), 'utf8');
  assert.match(source, /getJoinRequests/);
  assert.match(source, /reviewJoinRequest/);
  assert.match(source, /getScheduledPosts/);
  assert.match(source, /schedulePost/);
  assert.match(source, /publishScheduledPost/);
});


test('ChannelFeedController blocks plaintext reactions in E2E-required private channels', async () => {
  let upserts = 0;
  const notices = [];
  const channel = { id: 'private-e2e', is_public: false };
  const controller = new ChannelFeedController({
    repository: { client: { from: name => { assert.equal(name, 'channel_reactions'); return { upsert: async () => { upserts += 1; return { error: null }; } }; } } },
    getUser: () => ({ id: 'u1' }),
    e2eScopeRepository: { getScope: async () => Ok({ enabled: true }) },
    documentRef: createDocument(),
    windowRef: { currentChannel: channel },
    notify: message => notices.push(message)
  });
  controller.channel = channel;
  await controller.reactToPost('post-1', '👍');
  assert.equal(upserts, 0);
  assert.match(notices.join(' '), /требуется E2E/i);
});

test('private E2E channel subscribes to decrypted local messages and renders them', async () => {
  const documentRef = createDocument();
  const listeners = new Map();
  const windowRef = {
    currentChannel: null,
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); }
  };
  const controller = new ChannelFeedController({
    repository: {
      getShell: async () => Ok(createShell({ channel: { is_public: false, e2e_mode: 'required' } })),
      getEnrichment: async () => Ok({ reactions: [], votes: [], profileById: {} })
    },
    getUser: () => ({ id: 'u1' }),
    e2eRuntime: { getLocalConversation: async () => [] },
    documentRef,
    windowRef,
    notify: () => {}
  });
  await controller.open('ch1');
  assert.equal(typeof listeners.get('rim:e2e-message'), 'function');
  listeners.get('rim:e2e-message')({ detail: { message: {
    messageId: 'secret-post-1', conversationId: 'ch1', senderId: 'u2', body: 'encrypted text after decrypt', timestamp: 1700000000000
  } } });
  assert.equal(controller.feedState.posts.some(post => post.id === 'secret-post-1' && post._rimE2E === true), true);
  controller.dispose();
  assert.equal(listeners.has('rim:e2e-message'), false);
});
