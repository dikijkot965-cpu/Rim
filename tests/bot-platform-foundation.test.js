import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

test('RIM bot manager is opened from Tools and app lifecycle', () => {
  const html = read('index.html');
  const app = read('src/app.js');
  const nav = read('src/application/navigation-section-controller.js');
  assert.doesNotMatch(html, /id="tabBots"/);
  assert.doesNotMatch(html, /id="botsSection"/);
  assert.match(app, /new BotPlatformController/);
  assert.match(app, /rimOpenBots/);
  assert.doesNotMatch(nav, /'bots'/);
  assert.match(read('src/application/navigation-pages-controller.js'), /rimOpenBots/);
});

test('bot API stores token digests, authenticates bot tokens and gates message sends by membership', () => {
  const migration = read('supabase/migrations/20261120221000_rim_iteration_133_bot_platform.sql');
  const manage = read('supabase/functions/rim-bot-manage/index.ts');
  const api = read('supabase/functions/rim-bot-api/index.ts');
  assert.match(migration, /token_hash text not null/);
  assert.match(migration, /revoke all on public\.rim_bots from anon,authenticated/);
  assert.match(migration, /rim_capture_bot_message/);
  assert.match(migration, /sender_bot/);
  assert.match(migration, /bot_is_not_a_chat_member/);
  assert.match(manage, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(manage, /token_warning/);
  assert.match(api, /rim_bot_check_rate_limit/);
  assert.match(api, /rim_bot_send_message/);
  assert.match(api, /Authorization|authorization/);
});

test('direct-message E2E experimental crypto core is not falsely advertised as production', () => {
  const doc = read('docs/E2E_IMPLEMENTATION_DECISION.md');
  const engine = read('src/security/e2e/crypto-engine.js');
  assert.match(doc, /not enabled in the message send\/read path/);
  assert.match(doc, /not yet a production protocol/);
  assert.match(doc, /no proven forward secrecy for message sequences/);
  assert.match(engine, /AES-GCM/);
  assert.match(engine, /ECDH/);
});

test('bot workspace has no legacy 1 MB upload rejection and persists project source', () => {
  const controller = read('src/application/bot-platform-controller.js');
  const runtime = read('bot-runtime/server.mjs');
  assert.doesNotMatch(controller, /file\.size\s*>\s*1024\s*\*\s*1024/);
  assert.match(controller, /rim_bot_project_files/);
  assert.match(controller, /rim_bot_request_runtime/);
  assert.match(controller, /data-bot-action="editor-run"/);
  assert.match(runtime, /isolated-vm/);
  assert.match(runtime, /memoryLimit/);
  assert.match(runtime, /Bot execution timed out/);
  assert.match(runtime, /__rimHandler/);
});

test('bot runtime is a separate least-privilege container and never embeds service credentials in client code', () => {
  const runtimeReadme = read('bot-runtime/README.md');
  const compose = read('bot-runtime/compose.yaml');
  const docker = read('bot-runtime/Dockerfile');
  assert.match(runtimeReadme, /service key must remain on this server/i);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop: \[ALL\]/);
  assert.match(docker, /USER node/);
  assert.doesNotMatch(read('src/application/bot-platform-controller.js'), /SUPABASE_SERVICE_ROLE_KEY/);
});
