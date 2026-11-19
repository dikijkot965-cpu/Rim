import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSendAllowed,
  recordSendTimestamp,
  MIN_SEND_INTERVAL_MS,
  SEND_BURST_LIMIT
} from '../src/domain/send-policy.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('send policy blocks rapid double-send', () => {
  const now = 1_000_000;
  const recent = [now - 50];
  const decision = evaluateSendAllowed(recent, now);
  assert.equal(decision.ok, false);
  assert.ok((decision.retryAfterMs || 0) > 0);
});

test('send policy allows after interval', () => {
  const now = 1_000_000;
  const recent = [now - MIN_SEND_INTERVAL_MS - 1];
  assert.equal(evaluateSendAllowed(recent, now).ok, true);
});

test('burst window eventually blocks', () => {
  const now = 5_000_000;
  const recent = Array.from({ length: SEND_BURST_LIMIT }, (_, i) => now - 1000 + i);
  const decision = evaluateSendAllowed(recent, now);
  assert.equal(decision.ok, false);
});

test('recordSendTimestamp trims old entries', () => {
  const now = 10_000;
  const next = recordSendTimestamp([now - 60_000, now - 100], now, 10_000);
  assert.ok(next.every(t => t >= now - 10_000));
  assert.equal(next[next.length - 1], now);
});

test('message command service imports send policy', () => {
  const src = readFileSync(join(root, 'src/application/message-command-service.js'), 'utf8');
  assert.match(src, /evaluateSendAllowed/);
  assert.match(src, /assertSendPolicy/);
  assert.match(src, /noteSuccessfulSend/);
});
