import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelFeedController } from '../src/application/channel-feed-controller.js';

function makeHarness({ channel = { id: 'private-1', is_public: false }, scopeResult = { ok: true, value: { enabled: false } }, afterUpload = null } = {}) {
  const state = { user: { id: 'user-1' }, channel, uploads: [], removes: [], inserts: [], deletes: [], notices: [] };
  const input = { value: 'Проверочная публикация' };
  const media = { files: [{ name: 'x.png', size: 100, type: 'image/png' }], value: '' };
  const documentRef = { getElementById(id) { return id === 'rimChannelPostBody' ? input : id === 'rimChannelPostMedia' ? media : null; } };
  const storageBucket = {
    async upload(path, file, options) {
      state.uploads.push({ path, file, options });
      await afterUpload?.(state);
      return { error: null };
    },
    async remove(paths) { state.removes.push(paths); return { error: null }; }
  };
  const insertQuery = {
    async single() { return { data: { id: 'post-1' }, error: null }; }
  };
  const postsQuery = {
    insert(row) { state.inserts.push(row); return { select() { return insertQuery; } }; },
    delete() { return { eq: async (_key, id) => { state.deletes.push(id); return { error: null }; } }; }
  };
  const client = {
    storage: { from(name) { assert.equal(name, 'chat-files'); return storageBucket; } },
    from(name) { assert.equal(name, 'channel_posts'); return postsQuery; },
    functions: { invoke: async () => ({ data: null, error: null }) }
  };
  const windowRef = { currentChannel: channel, location: { origin: 'https://rim.invalid' } };
  const controller = new ChannelFeedController({
    repository: { client }, getUser: () => state.user,
    e2eScopeRepository: { getScope: async () => scopeResult },
    documentRef, windowRef, notify: message => state.notices.push(message)
  });
  controller.channel = channel;
  controller.open = async () => {};
  return { state, controller, input, media, windowRef };
}

test('private E2E-required channel blocks plaintext post before media upload', async () => {
  const h = makeHarness({ scopeResult: { ok: true, value: { enabled: true } } });
  await h.controller.publishFromComposer();
  assert.equal(h.state.uploads.length, 0);
  assert.equal(h.state.inserts.length, 0);
  assert.match(h.state.notices.at(-1), /E2E-канала/i);
});

test('private channel scope lookup error fails closed before upload', async () => {
  const h = makeHarness({ scopeResult: { ok: false, error: new Error('network unavailable') } });
  await h.controller.publishFromComposer();
  assert.equal(h.state.uploads.length, 0);
  assert.equal(h.state.inserts.length, 0);
  assert.match(h.state.notices.at(-1), /проверить режим защиты/i);
});

test('account switch during media upload removes uploaded file and does not insert post', async () => {
  const h = makeHarness({ afterUpload: state => { state.user = { id: 'user-2' }; } });
  await h.controller.publishFromComposer();
  assert.equal(h.state.uploads.length, 1);
  assert.equal(h.state.removes.length, 1);
  assert.equal(h.state.inserts.length, 0);
  assert.match(h.state.notices.at(-1), /файл удалён/i);
});

test('public channel keeps legacy publish path without private-scope lookup', async () => {
  const h = makeHarness({ channel: { id: 'public-1', is_public: true }, scopeResult: { ok: false, error: new Error('must not be called') } });
  h.controller.e2eScopeRepository.getScope = async () => { throw new Error('public channel should not query private E2E scope'); };
  await h.controller.publishFromComposer();
  assert.equal(h.state.uploads.length, 1);
  assert.equal(h.state.inserts.length, 1);
});

test('private channel publishing fails closed if E2E scope repository is not wired', async () => {
  const h = makeHarness();
  h.controller.e2eScopeRepository = null;
  await h.controller.publishFromComposer();
  assert.equal(h.state.uploads.length, 0);
  assert.equal(h.state.inserts.length, 0);
  assert.match(h.state.notices.at(-1), /проверить режим защиты/i);
});

test('E2E-required private channel sends encrypted fan-out and never writes channel_posts', async () => {
  const state = { sends: [], inserts: [], uploads: [], notices: [] };
  const input = { value: 'Текст для закрытого канала' };
  const media = { files: [], value: '' };
  const client = {
    from(table) {
      if (table === 'channel_members') {
        const query = { select() { return query; }, eq: async () => ({ data: [{ user_id: 'user-1' }, { user_id: 'user-2' }], error: null }) };
        return query;
      }
      if (table === 'channel_posts') return { insert(row) { state.inserts.push(row); return { select() { return { single: async () => ({ data: { id: 'plain-post' }, error: null }) }; } }; } };
      throw new Error(`unexpected table ${table}`);
    },
    storage: { from() { return { upload: async (...args) => { state.uploads.push(args); return { error: null }; } }; } }
  };
  const channel = { id: 'channel-e2e', is_public: false, e2e_mode: 'required' };
  const controller = new ChannelFeedController({
    repository: { client }, getUser: () => ({ id: 'user-1' }),
    e2eScopeRepository: { getScope: async () => ({ ok: true, value: { enabled: true, readiness: { ready: true }, memberUserIds: ['user-1', 'user-2'] } }) },
    e2eRuntime: { async sendGroup(members, body, options) { state.sends.push({ members, body, options }); return { acceptedRecipientCount: 1, failedRecipientCount: 0 }; } },
    documentRef: { getElementById(id) { return id === 'rimChannelPostBody' ? input : id === 'rimChannelPostMedia' ? media : null; } },
    windowRef: { currentChannel: channel, location: { origin: 'https://rim.invalid' } },
    notify: message => state.notices.push(message)
  });
  controller.channel = channel;
  await controller.publishFromComposer();
  assert.equal(state.sends.length, 1);
  assert.deepEqual(state.sends[0].members, ['user-1', 'user-2']);
  assert.equal(state.sends[0].options.scopeType, 'private_channel');
  assert.equal(state.inserts.length, 0);
  assert.equal(state.uploads.length, 0);
});
