import test from 'node:test';
import assert from 'node:assert/strict';
import { NavigationPagesController } from '../src/application/navigation-pages-controller.js';
import { ComposeChatService } from '../src/application/compose-chat-service.js';
import { ImperialCabinetController } from '../src/application/imperial-cabinet-controller.js';

test('navigation pages paint more and tools grids', () => {
  const pages = [];
  const controller = new NavigationPagesController({
    openPage: (title, html) => pages.push({ title, html }),
    setNavActive: () => {},
    windowRef: { document: { querySelectorAll: () => [] } }
  });
  controller.openMore();
  controller.openTools();
  assert.equal(pages[0].title, 'Ещё');
  assert.equal(pages[1].title, 'Инструменты');
  assert.match(pages[0].html, /data-rim-nav="openProfile"/);
  assert.match(pages[1].html, /data-rim-nav="newDirectChat"/);
});

test('compose newDirect cancels on empty prompt', async () => {
  const service = new ComposeChatService({
    client: {},
    getUser: () => ({ id: 'u1' }),
    prompt: () => null
  });
  const result = await service.newDirect();
  assert.equal(result.ok, true);
  assert.equal(result.value.cancelled, true);
});

test('compose newGroup allows an empty group and uses the atomic RPC', async () => {
  const calls = [];
  const service = new ComposeChatService({
    client: { rpc: async (name, args) => { calls.push({ name, args }); return { data: 'g1', error: null }; } },
    getUser: () => ({ id: 'u1' }),
    prompt: (q) => (String(q).includes('Название') ? 'Штаб' : ''),
    reloadConversations: async () => calls.push('reload'),
    openConversation: async id => calls.push(['open', id])
  });
  const result = await service.newGroup();
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], {
    name: 'rim_create_group_chat',
    args: { p_title: 'Штаб', p_invited_users: [], p_is_private: true, p_avatar_path: null }
  });
  assert.ok(calls.includes('reload'));
});

test('imperial cabinet shows tiles', () => {
  const pages = [];
  const controller = new ImperialCabinetController({
    showModal: html => pages.push(html),
    notificationCount: () => 3
  });
  controller.open();
  assert.match(pages[0], /Имперский кабинет/);
  assert.match(pages[0], /feature-count/);
});
