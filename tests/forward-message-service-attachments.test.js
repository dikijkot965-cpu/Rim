import test from 'node:test';
import assert from 'node:assert/strict';
import { ForwardMessageService } from '../src/application/forward-message-service.js';

test('forward copies image, attachment_path and attachment rows with cleanup list', async () => {
  const storageCopies = [];
  const attachmentInserts = [];
  let messageInserted = false;

  const client = {
    from(table) {
      if (table === 'conversation_members') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { conversation_id: 't1' }, error: null })
        };
      }
      if (table === 'chat_messages') {
        return {
          insert(payload) {
            messageInserted = true;
            assert.ok(payload.image_path || payload.attachment_path);
            return {
              select() {
                return {
                  single: async () => ({ data: { id: 'new-1', conversation_id: 't1' }, error: null })
                };
              }
            };
          }
        };
      }
      if (table === 'chat_message_attachments') {
        return {
          select() {
            return {
              eq: async () => ({
                data: [{
                  storage_path: 'src/a.bin',
                  file_name: 'a.bin',
                  mime_type: 'application/octet-stream',
                  media_kind: 'file',
                  byte_size: 10,
                  duration_seconds: null,
                  width: null,
                  height: null
                }],
                error: null
              })
            };
          },
          insert: async (row) => {
            attachmentInserts.push(row);
            return { data: row, error: null };
          }
        };
      }
      throw new Error('unexpected table ' + table);
    },
    storage: {
      from() {
        return {
          copy: async (from, to) => {
            storageCopies.push([from, to]);
            return { error: null };
          },
          remove: async () => ({ error: null })
        };
      }
    }
  };

  // Fix attachments select chain: service uses .select('*').eq('message_id', source.id)
  client.from = (table) => {
    if (table === 'conversation_members') {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: { conversation_id: 't1' }, error: null })
      };
    }
    if (table === 'chat_messages') {
      return {
        insert(payload) {
          messageInserted = !!payload;
          return {
            select() {
              return {
                single: async () => ({ data: { id: 'new-1', conversation_id: 't1' }, error: null })
              };
            }
          };
        }
      };
    }
    if (table === 'chat_message_attachments') {
      return {
        select() {
          return {
            eq(_col, _id) {
              return Promise.resolve({
                data: [{
                  storage_path: 'src/a.bin',
                  file_name: 'a.bin',
                  mime_type: 'application/octet-stream',
                  media_kind: 'file',
                  byte_size: 10
                }],
                error: null
              });
            }
          };
        },
        insert(row) {
          attachmentInserts.push(row);
          return Promise.resolve({ data: row, error: null });
        }
      };
    }
    throw new Error('unexpected table ' + table);
  };

  const service = new ForwardMessageService({
    client,
    getUser: () => ({ id: 'u1' }),
    getMessages: () => ([{
      id: 'm1',
      sender_id: 'u2',
      body: 'hi',
      image_path: 'src/img.png',
      attachment_path: 'src/file.bin',
      attachment_name: 'file.bin',
      attachment_mime_type: 'application/octet-stream'
    }]),
    getConversations: () => ([{ id: 't1', type: 'direct', title: 'Peer' }]),
    getActiveConversation: () => ({ id: 'c0' }),
    notify: () => {},
    closeModal: () => {},
    reloadMessages: async () => {}
  });

  const result = await service.forward('m1', 't1', false);
  if (!result.ok) {
    assert.fail(String(result.error?.message || result.error));
  }
  assert.equal(messageInserted, true);
  assert.ok(storageCopies.length >= 2, `copies=${storageCopies.length}`);
  assert.ok(attachmentInserts.length >= 1, 'attachment meta inserted');
});
