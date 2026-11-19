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

test('compose newGroup requires participants', async () => {
  const service = new ComposeChatService({
    client: {},
    getUser: () => ({ id: 'u1' }),
    prompt: (q) => (String(q).includes('Название') ? 'Штаб' : '')
  });
  const result = await service.newGroup();
  assert.equal(result.ok, false);
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
