import test from 'node:test';
import assert from 'node:assert/strict';
import { BlockListService } from '../src/application/block-list-service.js';

test('addByUsername rejects self-block', async () => {
  const service = new BlockListService({
    client: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { id: 'u1', username: 'me' }, error: null })
        };
      }
    },
    getUser: () => ({ id: 'u1' })
  });
  const result = await service.addByUsername('me');
  assert.equal(result.ok, false);
});

test('remove deletes block row for current user', async () => {
  const calls = [];
  const service = new BlockListService({
    client: {
      from(table) {
        return {
          delete() {
            calls.push(['delete', table]);
            return {
              eq() {
                return {
                  eq: async () => ({ error: null })
                };
              }
            };
          },
          select() { return this; },
          order() { return this; },
          // list() after remove
          then: undefined
        };
      }
    },
    getUser: () => ({ id: 'u1' }),
    showModal: () => {},
    notify: () => {}
  });
  // monkey-patch list to avoid full open chain
  service.list = async () => ({ ok: true, value: { rows: [], profiles: {} } });
  service.open = async () => ({ ok: true, value: { rows: [], profiles: {} } });
  const result = await service.remove('u2');
  assert.equal(result.ok, true);
  assert.ok(calls.some(c => c[0] === 'delete' && c[1] === 'user_blocks'));
});
