import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('group creation has one explicit UI owner and no prompt-based global override', async () => {
  const groups = await read('src/composition/groups-surface.js');
  const shell = await read('src/composition/shell-surface.js');
  const html = await read('index.html');
  assert.match(groups, /win\.rimOpenGroupCreate = openGroupCreate/);
  assert.match(groups, /win\.newGroupChat = openGroupCreate/);
  assert.doesNotMatch(shell, /win\.newGroupChat\s*=/);
  assert.match(html, /group:\s*window\.rimOpenGroupCreate\s*\|\|\s*window\.newGroupChat/);
  assert.match(html, /typeof route !== 'function'/);
});

test('atomic group RPC records creator, owner role and selected privacy before returning', async () => {
  const sql = await read('supabase/migrations/20261128120000_rim_iteration_184_atomic_group_creation.sql');
  assert.match(sql, /created_by, is_private, avatar_path/i);
  assert.match(sql, /values\s*\('group',\s*v_title,\s*v_user_id,\s*coalesce\(p_is_private, true\),\s*p_avatar_path\)/i);
  assert.match(sql, /values\s*\(v_conversation_id,\s*v_user_id,\s*'owner'\)/i);
  assert.match(sql, /grant execute on function public\.rim_create_group_chat\(text, uuid\[\], boolean, text\) to authenticated/i);
  assert.match(sql, /revoke all on function public\.rim_create_group_chat\(text, uuid\[\], boolean, text\) from public, anon/i);
});

test('group command calls the atomic RPC rather than creating a member-owned group then patching settings', async () => {
  const service = await read('src/application/group-command-service.js');
  assert.match(service, /rpc\('rim_create_group_chat'/);
  assert.match(service, /p_is_private:\s*!isPublic/);
  assert.doesNotMatch(service, /rpc\('rim_group_update_settings'/);
});

test('direct chats expose a lock action that starts a separate secret conversation', async () => {
  const app = await read('src/app.js');
  const info = await read('src/application/chat-info-controller.js');
  const audience = await read('src/composition/chat-audience.js');
  assert.match(app, /const visible = conversation\?\.type === 'direct'/);
  assert.match(app, /window\.startSecretChatWith\(peerId\)/);
  assert.match(info, /startSecretChatWith\('\$\{escapeHtml\(peerUserId\)\}'\)/);
  assert.match(audience, /win\.__RIM_LEGACY_CONTEXT\?\.getActiveConversation\?\.\(\)/);
});
