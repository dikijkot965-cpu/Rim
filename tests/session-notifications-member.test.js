import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionLifecycleService } from '../src/application/session-lifecycle-service.js';
import { NotificationPreferencesService } from '../src/application/notification-preferences-service.js';
import { MemberCardController } from '../src/application/member-card-controller.js';
import { CallsPlaceholderController } from '../src/application/calls-placeholder-controller.js';

test('signOut clears session and swaps screens', async () => {
  const appEl = { classList: { add: () => {}, remove: () => {} } };
  const authEl = { classList: { add: () => {}, remove: () => {} } };
  const status = { textContent: '' };
  const service = new SessionLifecycleService({
    client: { auth: { signOut: async () => ({ error: null }) }, removeChannel: async () => {} },
    documentRef: {
      getElementById(id) {
        if (id === 'app') return appEl;
        if (id === 'authScreen') return authEl;
        if (id === 'authStatus') return status;
        return null;
      }
    },
    windowRef: { currentUser: { id: 'u1' }, realtimeChannel: null, reactionChannel: null },
    notify: () => {}
  });
  const result = await service.signOut();
  assert.equal(result.ok, true);
  assert.equal(status.textContent, 'Вы вышли из аккаунта.');
});

test('notification saveFromDom upserts preferences', async () => {
  const calls = [];
  const service = new NotificationPreferencesService({
    client: {
      from(table) {
        return {
          upsert: async payload => { calls.push([table, payload]); return { error: null }; }
        };
      }
    },
    getUser: () => ({ id: 'u1' }),
    documentRef: {
      getElementById(id) {
        return { checked: id.includes('messages') };
      }
    },
    closeModal: () => {},
    notify: () => {}
  });
  const result = await service.saveFromDom();
  assert.equal(result.ok, true);
  assert.equal(calls[0][0], 'notification_preferences');
  assert.equal(calls[0][1].messages_enabled, true);
});

test('member card opens with profile data', async () => {
  const pages = [];
  const controller = new MemberCardController({
    client: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({
            data: { username: 'admiral', display_name: 'Адмирал', member_number: 7, created_at: '2024-01-01' },
            error: null
          })
        };
      }
    },
    getUser: () => ({ id: 'u1' }),
    showModal: html => pages.push(html)
  });
  const result = await controller.open();
  assert.equal(result.ok, true);
  assert.match(pages[0], /Имперское удостоверение/);
  assert.match(pages[0], /Адмирал/);
  assert.match(pages[0], />7</);
});

test('calls placeholder paints stub page', () => {
  const pages = [];
  const controller = new CallsPlaceholderController({
    openPage: (title, html) => pages.push({ title, html })
  });
  controller.open();
  assert.equal(pages[0].title, 'Звонки и видеозвонки');
  assert.match(pages[0].html, /Скоро/);
});
