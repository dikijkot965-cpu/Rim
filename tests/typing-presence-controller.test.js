import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingPresenceController } from '../src/application/typing-presence-controller.js';

function createClient() {
  const channels = [];
  return {
    channels,
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: { last_seen_at: '2026-01-01T00:00:00Z', show_online: true }, error: null }); },
        then(resolve, reject) {
          if (table === 'conversation_members') {
            return Promise.resolve({ data: [{ user_id: 'u1' }, { user_id: 'peer' }], error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        }
      };
    },
    channel(name) {
      const ch = {
        name,
        handlers: [],
        on(type, filter, handler) { this.handlers.push({ type, filter, handler }); return this; },
        subscribe(cb) { if (typeof cb === 'function') cb('SUBSCRIBED'); return this; },
        send() { return Promise.resolve(); }
      };
      channels.push(ch);
      return ch;
    },
    async removeChannel(ch) {
      const index = channels.indexOf(ch);
      if (index >= 0) channels.splice(index, 1);
    }
  };
}

test('typing bind replaces previous conversation channel', async () => {
  const client = createClient();
  const statuses = [];
  const controller = new TypingPresenceController({
    client,
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c2' }),
    setStatus: text => statuses.push(text),
    documentRef: { getElementById() { return null; } }
  });

  await controller.bind({ id: 'c1', type: 'direct' });
  assert.equal(client.channels.length, 1);
  assert.match(client.channels[0].name, /rim-typing-c1/);

  await controller.bind({ id: 'c2', type: 'direct' });
  assert.equal(client.channels.length, 1);
  assert.match(client.channels[0].name, /rim-typing-c2/);
  await controller.dispose();
});

test('stale typing bind does not keep channel after newer bind starts', async () => {
  const client = createClient();
  let resolveMembers;
  const slowClient = {
    channels: client.channels,
    from(table) {
      if (table === 'conversation_members') {
        return {
          select() { return this; },
          eq() { return this; },
          then(resolve, reject) {
            return new Promise(r => { resolveMembers = () => resolve({ data: [{ user_id: 'u1' }, { user_id: 'peer' }], error: null }); }).then(resolve, reject);
          }
        };
      }
      return client.from(table);
    },
    channel: client.channel.bind(client),
    removeChannel: client.removeChannel.bind(client)
  };

  const controller = new TypingPresenceController({
    client: slowClient,
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c2' }),
    setStatus: () => {},
    documentRef: { getElementById() { return null; } }
  });

  const first = controller.bind({ id: 'c1', type: 'direct' });
  const second = controller.bind({ id: 'c2', type: 'group' });
  resolveMembers?.();
  await Promise.all([first, second]);
  // only latest channel should remain
  assert.ok(client.channels.length <= 1);
  if (client.channels[0]) assert.match(client.channels[0].name, /rim-typing-c2/);
  await controller.dispose();
});

test('sendTyping throttles rapid true events', async () => {
  const client = createClient();
  const sent = [];
  const controller = new TypingPresenceController({
    client,
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c1' }),
    setStatus: () => {},
    documentRef: { getElementById() { return null; } },
    sendThrottleMs: 1000
  });
  await controller.bind({ id: 'c1', type: 'group' });
  const channel = client.channels[0];
  channel.send = payload => { sent.push(payload); return Promise.resolve(); };
  controller.sendTyping(true);
  controller.sendTyping(true);
  assert.equal(sent.length, 1);
  await controller.dispose();
});
