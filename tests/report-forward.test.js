import test from 'node:test';
import assert from 'node:assert/strict';
import { ReportService } from '../src/application/report-service.js';
import { ForwardMessageService } from '../src/application/forward-message-service.js';

test('submitFromDom requires details and username', async () => {
  const service = new ReportService({
    client: { from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }; } },
    getUser: () => ({ id: 'u1' }),
    documentRef: {
      getElementById(id) {
        if (id === 'reportDetails') return { value: '' };
        if (id === 'reportUsername') return { value: '' };
        if (id === 'reportReason') return { value: 'spam' };
        return null;
      }
    }
  });
  assert.equal((await service.submitFromDom()).ok, false);
});

test('forward rejects missing source message', async () => {
  const service = new ForwardMessageService({
    client: {},
    getUser: () => ({ id: 'u1' }),
    getMessages: () => []
  });
  const result = await service.forward('m1', 'c2', false);
  assert.equal(result.ok, false);
});

test('forward inserts into target conversation', async () => {
  const calls = [];
  const service = new ForwardMessageService({
    client: {
      from(table) {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { conversation_id: 'c2' }, error: null }),
          insert(payload) {
            calls.push(['insert', table, payload]);
            return { select() { return { single: async () => ({ data: { id: 'm9' }, error: null }) }; } };
          }
        };
      },
      storage: { from() { return { copy: async () => ({ error: null }) }; } }
    },
    getUser: () => ({ id: 'u1' }),
    getMessages: () => [{ id: 'm1', body: 'hello', sender_id: 'u2' }],
    getActiveConversation: () => ({ id: 'c1' }),
    closeModal: () => calls.push('close'),
    notify: () => {}
  });
  const result = await service.forward('m1', 'c2', true);
  assert.equal(result.ok, true);
  assert.ok(calls.some(c => c[0] === 'insert' && c[2].forwarded_hide_sender === true));
});
