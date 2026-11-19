import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeliveryStatus, shouldShowDeliveryTicks, DELIVERY } from '../src/domain/delivery.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('delivery resolves queued and read', () => {
  assert.equal(resolveDeliveryStatus({ _rimOutboxPending: true }).status, DELIVERY.QUEUED);
  const sent = resolveDeliveryStatus({ id: 'm1', sender_id: 'u1', created_at: '2026-01-01T00:00:00.000Z' }, { peerReadAt: null });
  assert.equal(sent.status, DELIVERY.SENT);
  const read = resolveDeliveryStatus(
    { id: 'm1', sender_id: 'u1', created_at: '2026-01-01T00:00:00.000Z' },
    { peerReadAt: Date.parse('2026-01-01T00:01:00.000Z'), receiptsEnabled: true }
  );
  assert.equal(read.status, DELIVERY.READ);
  assert.equal(read.ticks, '✓✓');
});

test('shouldShowDeliveryTicks for own and outbox', () => {
  assert.equal(shouldShowDeliveryTicks({ _rimOutboxPending: true }, 'u1'), true);
  assert.equal(shouldShowDeliveryTicks({ sender_id: 'u1' }, 'u1'), true);
  assert.equal(shouldShowDeliveryTicks({ sender_id: 'u2' }, 'u1'), false);
});

test('renderer imports delivery domain', () => {
  const src = readFileSync(join(root, 'src/application/message-list-renderer.js'), 'utf8');
  assert.match(src, /resolveDeliveryStatus/);
  assert.match(src, /data-rim-delivery/);
});
