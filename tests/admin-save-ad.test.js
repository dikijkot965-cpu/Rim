import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminCommandService } from '../src/application/admin-command-service.js';

test('saveAd validates title and url', async () => {
  const service = new AdminCommandService({
    client: {},
    getUser: () => ({ id: 'u1' }),
    canManage: () => true
  });
  assert.equal((await service.saveAd({ title: '', body: 'x' })).ok, false);
  assert.equal((await service.saveAd({ title: 't', body: 'b', url: 'not-a-url' })).ok, false);
});

test('saveAd inserts campaign and optional target', async () => {
  const calls = [];
  const service = new AdminCommandService({
    client: {
      storage: {
        from() {
          return {
            upload: async () => ({ error: null }),
            remove: async () => ({ error: null })
          };
        }
      },
      from(table) {
        return {
          insert(payload) {
            calls.push(['insert', table, payload]);
            if (table === 'ad_campaigns') {
              return {
                select() {
                  return { single: async () => ({ data: { id: 'ad1' }, error: null }) };
                }
              };
            }
            return Promise.resolve({ error: null });
          },
          upsert(payload) {
            calls.push(['upsert', table, payload]);
            return Promise.resolve({ error: null });
          },
          delete() { return { eq: async () => ({ error: null }) }; },
          select() { return this; },
          order() { return this; },
          limit: async () => ({ data: [], error: null })
        };
      }
    },
    getUser: () => ({ id: 'u1' }),
    canManage: () => true
  });
  const result = await service.saveAd({
    title: 'Кампания',
    body: 'Текст',
    url: 'https://example.com',
    channelId: 'ch1',
    amount: 100,
    paymentStatus: 'paid'
  });
  assert.equal(result.ok, true);
  assert.ok(calls.some(call => call[0] === 'insert' && call[1] === 'ad_campaigns'));
  assert.ok(calls.some(call => call[0] === 'insert' && call[1] === 'ad_campaign_targets'));
  assert.ok(calls.some(call => call[0] === 'upsert' && call[1] === 'ad_campaign_financials'));
});
