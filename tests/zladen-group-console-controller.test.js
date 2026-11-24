import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildZladenTriggerCommand,
  buildZladenJoinTriggerCommand,
  ZladenGroupConsoleController
} from '../src/application/zladen-group-console-controller.js';

test('Zladen trigger form builds a valid message-reply command', () => {
  assert.equal(
    buildZladenTriggerCommand({
      name: 'greeting',
      matchType: 'contains',
      matchValue: 'добрый день',
      actionType: 'reply',
      actionValue: 'Здравствуйте!'
    }),
    '/trigger add greeting | contains:добрый день | reply:Здравствуйте!'
  );
});

test('Zladen trigger form bounds daily point grants and rejects command injection separators', () => {
  assert.equal(
    buildZladenTriggerCommand({
      name: 'daily-welcome',
      matchType: 'starts_with',
      matchValue: 'привет',
      actionType: 'grant',
      actionValue: '25'
    }),
    '/trigger add daily-welcome | starts_with:привет | grant:25'
  );
  assert.throws(() => buildZladenTriggerCommand({
    name: 'bad|name', matchType: 'contains', matchValue: 'привет',
    actionType: 'reply', actionValue: 'ok'
  }), /символа \|/);
  assert.throws(() => buildZladenTriggerCommand({
    name: 'welcome', matchType: 'contains', matchValue: 'привет',
    actionType: 'grant', actionValue: '1001'
  }), /от 1 до 1000/);
  assert.throws(() => buildZladenTriggerCommand({
    name: 'welcome', matchType: 'contains', matchValue: 'x',
    actionType: 'reply', actionValue: 'ok'
  }), /минимум два символа/);
});

test('Zladen join trigger form creates a safe greeting command', () => {
  assert.equal(
    buildZladenJoinTriggerCommand({ name: 'new-member', text: 'Добро пожаловать!' }),
    '/trigger join_add new-member | reply:Добро пожаловать!'
  );
});

test('Zladen command console refuses plaintext commands in pending and required E2E scopes', async () => {
  for (const e2e_mode of ['pending', 'required']) {
    const inserted = [];
    const notices = [];
    const client = {
      from(table) {
        if (table === 'conversations') return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { id: 'g1', type: 'group', e2e_mode }, error: null })
        };
        if (table === 'chat_messages') return {
          insert(value) { inserted.push(value); return this; },
          select() { return this; },
          maybeSingle: async () => ({ data: { id: 'm1' }, error: null })
        };
        throw new Error('unexpected table ' + table);
      }
    };
    const controller = new ZladenGroupConsoleController({
      client, getUser: () => ({ id: 'u1' }), notify: message => notices.push(message),
      windowRef: {}
    });
    controller.group = { id: 'g1' };
    assert.equal(await controller.sendCommand('/menu'), false);
    assert.equal(inserted.length, 0);
    assert.match(notices[0], /E2E/);
  }
});

test('Zladen command console posts a command only to an ordinary group', async () => {
  const inserted = [];
  const opened = [];
  const client = {
    from(table) {
      if (table === 'conversations') return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: { id: 'g1', type: 'group', e2e_mode: 'off' }, error: null })
      };
      if (table === 'chat_messages') return {
        insert(value) { inserted.push(value); return this; },
        select() { return this; },
        maybeSingle: async () => ({ data: { id: 'm1' }, error: null })
      };
      throw new Error('unexpected table ' + table);
    }
  };
  const controller = new ZladenGroupConsoleController({
    client, getUser: () => ({ id: 'u1' }), notify: () => {},
    windowRef: {
      closeModal() {},
      async openConversation(id) { opened.push(id); },
      async loadMessages() {}
    }
  });
  controller.group = { id: 'g1' };
  assert.equal(await controller.sendCommand('/menu'), true);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].conversation_id, 'g1');
  assert.equal(inserted[0].sender_id, 'u1');
  assert.equal(inserted[0].body, '/menu');
  assert.match(inserted[0].client_message_id, /^zladen-ui:/);
  assert.deepEqual(opened, ['g1']);
});
