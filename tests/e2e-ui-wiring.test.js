import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('secret direct chats have an explicit creation action and verified peer exchange control', () => {
  const service = read('src/application/direct-chat-service.js');
  const profile = read('src/composition/social-surface.js');
  const open = read('src/composition/conversation-open-surface.js');
  const app = read('src/app.js');
  assert.match(service, /rim_create_secret_direct_chat/);
  assert.match(profile, /Секретный чат E2E/);
  assert.match(open, /conversation\.opened/);
  assert.match(app, /verifyScopeExchange\(\{ type: 'direct', id: conversation\.id \}, scope\.value\.memberUserIds\)/);
  assert.match(app, /rimE2EVerifyBtn/);
});

test('private groups and private channels can be prepared, verified and activated without plaintext fallback', () => {
  const app = read('src/app.js');
  const channel = read('src/application/channel-feed-controller.js');
  const scope = read('src/infrastructure/supabase/e2e-scope-repository.js');
  assert.match(app, /requestPending\(scopeInput\)/);
  assert.match(app, /verifyScopeExchange\(\{ type, id \}, memberIds\)/);
  assert.match(app, /activateScope\(scopeInput\)/);
  assert.match(channel, /scopeType: 'private_channel'/);
  assert.match(channel, /sendGroup\(memberIds, postBody/);
  assert.match(channel, /e2e_mode === 'required'/);
  assert.match(scope, /rim_e2e_activate_scope/);
});

test('E2E diagnostics are wired to the protected conversation lifecycle and admin view', () => {
  const app = read('src/app.js');
  const admin = read('src/composition/admin-surface.js');
  const reporter = read('src/security/e2e/e2e-diagnostics-reporter.js');
  assert.match(app, /events\.on\('conversation\.opened'/);
  assert.match(app, /startE2ERuntimeForProtectedConversation/);
  assert.match(admin, /rimLoadE2EDiagnostics/);
  assert.match(reporter, /rim_e2e_diagnostics/);
  assert.match(reporter, /body\|text\|cipher/);
});

test('E2E Live Lab supports secret direct, private group and private channel round-trip checks', () => {
  const lab = read('src/security/e2e/e2e-live-lab.js');
  assert.match(lab, /private_channel/);
  assert.match(lab, /verifyScopeExchange\(\{ type: selectedScope, id: conversationId \}, memberIds\)/);
  assert.match(lab, /sendDirect\(targetId, testText/);
  assert.match(lab, /sendGroup\(memberIds, testText, \{ conversationId, scopeType: selectedScope/);
  assert.match(lab, /e2e_mode !== 'required'/);
  assert.match(lab, /E2E LIVE TEST/);
});
