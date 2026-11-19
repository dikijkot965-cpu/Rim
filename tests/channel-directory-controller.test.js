import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ChannelDirectoryController,
  normalizeChannelScope,
  renderChannelDirectoryRows
} from '../src/application/channel-directory-controller.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function makeElement(id = '') {
  const listeners = new Map();
  return {
    id, value: '', className: '', innerHTML: '', dataset: {},
    children: [], parentNode: null,
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    dispatch(type, event) { listeners.get(type)?.(event); },
    contains(node) { return node === this || this.children.includes(node); },
    insertBefore(node) { node.parentNode = this; this.children.push(node); },
    append(node) { node.parentNode = this; this.children.push(node); }
  };
}

function makeDocument() {
  const section = makeElement('channelsSection');
  const list = makeElement('channelList');
  const nodes = new Map([['channelsSection', section], ['channelList', list]]);
  section.insertBefore = node => { node.parentNode = section; section.children.push(node); nodes.set(node.id, node); };
  return {
    section, list, nodes,
    getElementById(id) { return nodes.get(id) || null; },
    createElement() { return makeElement(); }
  };
}

test('channel scope accepts only the two supported states', () => {
  assert.equal(normalizeChannelScope('subscribed'), 'subscribed');
  assert.equal(normalizeChannelScope('all'), 'all');
  assert.equal(normalizeChannelScope('unexpected'), 'all');
});

test('channel directory renders subscribed and public/private actions with existing classes', () => {
  const html = renderChannelDirectoryRows([
    { id: 'c1', title: 'Открытый', description: 'Описание', is_public: true, username: 'open' },
    { id: 'c2', title: 'Открытый без подписки', is_public: true },
    { id: 'c3', title: 'Закрытый', is_public: false }
  ], new Set(['c1']));
  assert.match(html, /class="rim-channel-row"/);
  assert.match(html, /class="rim-channel-avatar"/);
  assert.match(html, /data-rim-channel-action="open" data-channel-id="c1"/);
  assert.match(html, /data-rim-channel-action="join" data-channel-id="c2"/);
  assert.match(html, /Публичный · @open · Вы подписаны/);
  assert.match(html, /По приглашению/);
});

test('subscribed scope filters rows by actual membership, not public visibility', () => {
  const html = renderChannelDirectoryRows([
    { id: 'public', title: 'Публичный', is_public: true },
    { id: 'private', title: 'Закрытый', is_public: false }
  ], new Set(['private']), 'subscribed');
  assert.match(html, /Закрытый/);
  assert.doesNotMatch(html, /Публичный/);
});

test('channel directory escapes untrusted display values and uses data actions, not inline JavaScript', () => {
  const html = renderChannelDirectoryRows([
    { id: 'x" onclick="alert(1)', title: '<img src=x>', description: '" onmouseover="x', is_public: true, username: 'a&b' }
  ], new Set());
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /&quot; onmouseover=&quot;x/);
  assert.match(html, /a&amp;b/);
  assert.match(html, /data-channel-id="x&quot; onclick=&quot;alert\(1\)"/);
  assert.doesNotMatch(html, /\sonclick="/);
});

test('channel directory renders the correct empty state for each scope', () => {
  assert.match(renderChannelDirectoryRows([], [], 'all'), /Каналов пока нет/);
  assert.match(renderChannelDirectoryRows([{ id: 'c1' }], [], 'subscribed'), /Вы ещё не подписаны/);
});

test('stale channel-directory responses cannot overwrite a newer filter request', async () => {
  const doc = makeDocument();
  const first = deferred();
  const second = deferred();
  let call = 0;
  const controller = new ChannelDirectoryController({
    repository: { getDirectory() { call++; return call === 1 ? first.promise : second.promise; } },
    getUser: () => ({ id: 'me' }), documentRef: doc, windowRef: {}
  });
  const oldLoad = controller.load();
  const newLoad = controller.setScope('subscribed');
  second.resolve({ ok: true, value: { channels: [{ id: 'new', title: 'Новый результат' }], subscribedChannelIds: ['new'] } });
  await newLoad;
  first.resolve({ ok: true, value: { channels: [{ id: 'old', title: 'Устаревший результат' }], subscribedChannelIds: [] } });
  await oldLoad;
  assert.match(doc.list.innerHTML, /Новый результат/);
  assert.doesNotMatch(doc.list.innerHTML, /Устаревший результат/);
  assert.equal(doc.nodes.get('rimChannelScope').value, 'subscribed');
  controller.dispose();
});

test('channel-list action delegation calls existing open and join commands', async () => {
  const doc = makeDocument();
  const calls = [];
  const controller = new ChannelDirectoryController({
    repository: { async getDirectory() { return { ok: true, value: { channels: [], subscribedChannelIds: [] } }; } },
    getUser: () => ({ id: 'me' }), documentRef: doc,
    windowRef: { openChannel: id => calls.push(['open', id]), rimJoinChannel: id => calls.push(['join', id]) }
  });
  await controller.load();
  const openButton = { dataset: { rimChannelAction: 'open', channelId: 'c1' } };
  const joinButton = { dataset: { rimChannelAction: 'join', channelId: 'c2' } };
  doc.list.children.push(openButton, joinButton);
  doc.list.dispatch('click', { target: { closest: selector => selector === '[data-rim-channel-action]' ? openButton : null } });
  doc.list.dispatch('click', { target: { closest: selector => selector === '[data-rim-channel-action]' ? joinButton : null } });
  assert.deepEqual(calls, [['open', 'c1'], ['join', 'c2']]);
  controller.dispose();
});

test('channel directory reports missing user and disposes pending requests safely', async () => {
  const doc = makeDocument();
  const pending = deferred();
  const controller = new ChannelDirectoryController({
    repository: { getDirectory: () => pending.promise }, getUser: () => ({ id: 'me' }), documentRef: doc, windowRef: {}
  });
  const missingUser = new ChannelDirectoryController({
    repository: { async getDirectory() { throw new Error('must not query'); } }, getUser: () => null, documentRef: doc, windowRef: {}
  });
  await missingUser.load();
  assert.match(doc.list.innerHTML, /Не удалось определить пользователя/);
  const task = controller.load();
  controller.dispose();
  pending.resolve({ ok: true, value: { channels: [{ id: 'c1' }], subscribedChannelIds: [] } });
  await task;
  assert.equal(doc.list.innerHTML, '<div class="feature-small">Загрузка каналов…</div>');
});
