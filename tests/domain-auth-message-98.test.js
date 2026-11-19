import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMessageBody, validateImageAttachment, isOwnMessage } from '../src/domain/message.js';
import {
  validateEmail,
  validateLoginCredentials,
  validateRegistrationCredentials
} from '../src/domain/auth-credentials.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('normalizeMessageBody rejects empty and too long', () => {
  assert.equal(normalizeMessageBody('  ').ok, false);
  assert.equal(normalizeMessageBody('hello').ok, true);
  assert.equal(normalizeMessageBody('x'.repeat(5000)).ok, false);
});

test('validateImageAttachment checks type', () => {
  assert.equal(validateImageAttachment(null).ok, false);
  assert.equal(validateImageAttachment({ type: 'image/png', size: 10 }).ok, true);
  assert.equal(validateImageAttachment({ type: 'application/pdf', size: 10 }).ok, false);
});

test('isOwnMessage compares ids as strings', () => {
  assert.equal(isOwnMessage({ sender_id: 1 }, '1'), true);
  assert.equal(isOwnMessage({ sender_id: 'a' }, 'b'), false);
});

test('auth credential rules', () => {
  assert.equal(validateEmail('bad').ok, false);
  assert.equal(validateEmail('a@b.co').ok, true);
  assert.equal(validateLoginCredentials('a@b.co', '').ok, false);
  assert.equal(validateLoginCredentials('a@b.co', 'secret').ok, true);
  assert.equal(validateRegistrationCredentials('a@b.co', 'short', 'short').ok, false);
  assert.equal(validateRegistrationCredentials('a@b.co', 'longenough', 'longenough').ok, true);
  assert.equal(validateRegistrationCredentials('a@b.co', 'longenough', 'other').ok, false);
});

test('auth form controller and shell wiring present', () => {
  const auth = readFileSync(join(root, 'src/application/auth-form-controller.js'), 'utf8');
  const shell = readFileSync(join(root, 'src/composition/shell-surface.js'), 'utf8');
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(auth, /class AuthFormController/);
  assert.match(shell, /AuthFormController/);
  assert.match(boot, /__RIM_AUTH_FORM_OWNED/);
});
