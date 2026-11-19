import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceMessageController } from '../src/application/voice-message-controller.js';

test('ensureButton creates recording control once', () => {
  const nodes = {};
  const input = {
    closest() { return { insertBefore(node, ref) { this._btn = node; this._ref = ref; } }; },
    parentElement: null
  };
  const documentRef = {
    getElementById(id) {
      if (id === 'messageInput') return input;
      if (id === 'rimReleaseVoiceBtn') return nodes.btn || null;
      return null;
    },
    createElement(tag) {
      const el = {
        type: '', id: '', className: '', title: '', textContent: '',
        listeners: [],
        setAttribute() {},
        addEventListener(type, fn) { this.listeners.push([type, fn]); },
        classList: { add() {}, remove() {} }
      };
      return el;
    }
  };
  const controller = new VoiceMessageController({
    client: {},
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c1' }),
    documentRef
  });
  const first = controller.ensureButton();
  nodes.btn = first;
  const second = controller.ensureButton();
  assert.equal(first.id, 'rimReleaseVoiceBtn');
  assert.equal(second, first);
  controller.dispose();
});

test('send uploads blob and inserts message + attachment rows', async () => {
  const calls = [];
  const client = {
    storage: {
      from(bucket) {
        return {
          upload: async (path, blob, opts) => { calls.push(['upload', bucket, path, opts.contentType]); return { error: null }; },
          remove: async paths => { calls.push(['remove', paths]); return { error: null }; }
        };
      }
    },
    from(table) {
      return {
        insert(payload) {
          calls.push(['insert', table, payload]);
          return {
            select() {
              return {
                single: async () => ({ data: { id: 'm1', created_at: '2026-01-01' }, error: null })
              };
            },
            then(resolve) { return Promise.resolve({ error: null }).then(resolve); }
          };
        },
        delete() { return { eq: async () => ({ error: null }) }; }
      };
    }
  };
  // fix insert chain for attachments without select
  client.from = function(table) {
    const api = {
      insert(payload) {
        calls.push(['insert', table, payload]);
        if (table === 'chat_messages') {
          return {
            select() {
              return { single: async () => ({ data: { id: 'm1', created_at: '2026-01-01' }, error: null }) };
            }
          };
        }
        return Promise.resolve({ error: null });
      },
      delete() { return { eq: async () => ({ error: null }) }; }
    };
    return api;
  };

  const reloads = [];
  const controller = new VoiceMessageController({
    client,
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c1' }),
    notify: () => {},
    reloadMessages: async () => reloads.push('reload'),
    documentRef: { getElementById() { return null; } }
  });
  const blob = new Blob(['abc'], { type: 'audio/webm' });
  const result = await controller.send(blob, 3);
  assert.equal(result.ok, true);
  assert.ok(calls.some(call => call[0] === 'upload' && call[1] === 'chat-files'));
  assert.ok(calls.some(call => call[0] === 'insert' && call[1] === 'chat_messages'));
  assert.ok(calls.some(call => call[0] === 'insert' && call[1] === 'chat_message_attachments'));
  assert.ok(calls.some(call => call[0] === 'insert' && call[1] === 'chat_voice_messages'));
  assert.deepEqual(reloads, ['reload']);
  controller.dispose();
});
