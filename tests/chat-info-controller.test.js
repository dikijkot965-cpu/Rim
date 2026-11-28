import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatInfoController } from '../src/application/chat-info-controller.js';

function makeClient({ members = [], profiles = [], insertError = null } = {}) {
  return {
    from(table) {
      if (table === 'conversation_members') {
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({ data: members, error: null });
              }
            };
          },
          insert() {
            return Promise.resolve({ data: null, error: insertError });
          }
        };
      }
      if (table === 'profiles') {
        return {
          select() {
            return {
              in() {
                return Promise.resolve({ data: profiles, error: null });
              },
              eq() {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: profiles[0] || null,
                      error: profiles[0] ? null : new Error('not found')
                    });
                  }
                };
              }
            };
          }
        };
      }
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({ data: [], error: null });
            }
          };
        }
      };
    }
  };
}

test('open rejects when no active conversation', async () => {
  const ctrl = new ChatInfoController({
    client: makeClient(),
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => null,
    showModal: () => {}
  });
  const result = await ctrl.open();
  assert.equal(result.ok, false);
});

test('open renders members modal', async () => {
  let modalHtml = '';
  const ctrl = new ChatInfoController({
    client: makeClient({
      members: [{ user_id: 'u2' }, { user_id: 'u3' }],
      profiles: [
        { id: 'u2', username: 'alice', display_name: 'Алиса' },
        { id: 'u3', username: 'bob', display_name: 'Боб' }
      ]
    }),
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c1', type: 'group', title: 'Тест-группа' }),
    showModal: html => { modalHtml = html; },
    windowRef: { document: { querySelector: () => null, createElement: () => ({ appendChild() {} }) } }
  });
  const result = await ctrl.open();
  assert.equal(result.ok, true);
  assert.match(modalHtml, /Тест-группа/);
  assert.match(modalHtml, /Алиса/);
  assert.match(modalHtml, /@alice/);
  assert.match(modalHtml, /Добавить участника/);
});

test('ordinary direct chat offers a separate secret E2E conversation with the peer', async () => {
  let modalHtml = '';
  const ctrl = new ChatInfoController({
    client: makeClient({ members: [{ user_id: 'u1' }, { user_id: 'u2' }], profiles: [{ id: 'u2', username: 'alice' }] }),
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c1', type: 'direct', is_secret: false, e2e_mode: 'off' }),
    showModal: html => { modalHtml = html; },
    windowRef: { document: { querySelector: () => null } }
  });
  const result = await ctrl.open();
  assert.equal(result.ok, true);
  assert.match(modalHtml, /Создать отдельный секретный чат E2E/);
  assert.match(modalHtml, /startSecretChatWith\('u2'\)/);
});

test('open omits add-member for direct chats', async () => {
  let modalHtml = '';
  const ctrl = new ChatInfoController({
    client: makeClient({ members: [{ user_id: 'u2' }], profiles: [{ id: 'u2', username: 'alice' }] }),
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c1', type: 'direct' }),
    showModal: html => { modalHtml = html; },
    windowRef: { document: { querySelector: () => null } }
  });
  await ctrl.open();
  assert.doesNotMatch(modalHtml, /Добавить участника/);
});

test('addGroupMember cancels on empty prompt', async () => {
  const ctrl = new ChatInfoController({
    client: makeClient(),
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c1', type: 'group' }),
    windowRef: { prompt: () => null },
    showModal: () => {}
  });
  const result = await ctrl.addGroupMember();
  assert.equal(result.ok, true);
  assert.equal(result.value?.cancelled, true);
});

