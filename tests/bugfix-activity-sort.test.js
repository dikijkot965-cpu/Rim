import test from 'node:test';
import assert from 'node:assert/strict';
import { compareConversations, conversationActivityTime } from '../src/application/conversation-state-controller.js';

test('conversations with newer last message rank higher', () => {
  const a = { id: '1', created_at: '2020-01-01T00:00:00Z', _rimLastMessageAt: '2026-01-01T00:00:00Z' };
  const b = { id: '2', created_at: '2025-01-01T00:00:00Z', _rimLastMessageAt: '2024-01-01T00:00:00Z' };
  assert.ok(compareConversations(a, b) < 0);
  assert.ok(conversationActivityTime(a) > conversationActivityTime(b));
});
