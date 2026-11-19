import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('real inline chat entry point is bridged to the modular paginated loader', async () => {
  const [html, legacy, baseLegacy, app] = await Promise.all([
    readFile(path.join(root, 'index.html'), 'utf8'),
    readFile(path.join(root, 'assets/js/legacy/24-rim-architecture-rebuild-2026-11-05.js'), 'utf8'),
    readFile(path.join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8'),
    readFile(path.join(root, 'src/app.js'), 'utf8')
  ]);
  assert.match(html, /onclick="sendMessage\(\)"/);
  // Classic inline openConversation paint retired — modular list uses data-conversation-id.
  assert.match(baseLegacy, /__RIM_CONVERSATION_LIST_RENDER_OWNED|Список чатов ещё загружается/);
  const listController = await readFile(path.join(root, 'src/application/conversation-list-controller.js'), 'utf8');
  assert.match(listController, /data-conversation-id/);
  assert.match(legacy, /window\.rimLoadMessagesStable\(\)/);
  assert.match(legacy, /window\.subscribeToMessages\(\)/);
  const timelineSurface = await readFile(path.join(root, 'src/composition/message-timeline-surface.js'), 'utf8');
  assert.match(app, /bindMessageTimelineSurface/);
  assert.match(timelineSurface, /rimLoadMessagesStable/);
  assert.match(timelineSurface, /__RIM_MESSAGE_TIMELINE_OWNED/);
  assert.match(timelineSurface, /loadMessages/);
  assert.match(timelineSurface, /markConversationRead/);
  assert.match(timelineSurface, /loadLatest/);
});

test('channel feed uses staged rendering, bounded initial reads, lazy comments and stale-request guards', async () => {
  const [repo, controller, app, composition] = await Promise.all([
    readFile(path.join(root, 'src/infrastructure/supabase/channel-feed-repository.js'), 'utf8'),
    readFile(path.join(root, 'src/application/channel-feed-controller.js'), 'utf8'),
    readFile(path.join(root, 'src/app.js'), 'utf8'),
    readFile(path.join(root, 'src/composition/channels-surface.js'), 'utf8')
  ]);
  assert.match(repo, /DEFAULT_POST_LIMIT = 30/);
  assert.match(repo, /DEFAULT_POLL_LIMIT = 20/);
  assert.match(repo, /DEFAULT_COMMENT_LIMIT = 100/);
  assert.match(controller, /rim-cf-feed-state/);
  assert.match(controller, /requestEpoch/);
  assert.match(controller, /loadComments/);
  assert.match(controller, /data-rim-cf-action/);
  assert.doesNotMatch(controller, /onclick="rimReactChannelPost/);
  assert.match(app, /bindChannelsSurface/);
  assert.match(composition, /openChannel/);
  assert.match(composition, /rimCloseChannelFull/);
  assert.match(composition, /rimLoadChannelComments/);
});


test('conversation projection responsibilities are retired from legacy wrappers', () => {
  const legacyUnread = fs.readFileSync(new URL('../assets/js/legacy/03-legacy-03.js', import.meta.url), 'utf8');
  const legacySort = fs.readFileSync(new URL('../assets/js/legacy/16-rim-release-patch-2026-11.js', import.meta.url), 'utf8');
  const legacyStability = fs.readFileSync(new URL('../assets/js/legacy/25-rim-stability-consolidated-20261105.js', import.meta.url), 'utf8');
  const application = fs.readFileSync(new URL('../src/application/conversation-state-controller.js', import.meta.url), 'utf8');
  assert.doesNotMatch(legacyUnread, /Show per-conversation unread counters/);
  assert.doesNotMatch(legacySort, /Last activity ordering/);
  assert.doesNotMatch(legacyStability, /Global message stream updates the chat list/);
  assert.match(application, /getReadStates/);
  assert.match(application, /startRealtime/);
  assert.match(application, /markActiveConversationRead/);
});

test('legacy chat ordering and read-cursor writers are no longer duplicated', async () => {
  const core = await readFile(path.join(root, 'assets/js/core/rim-core-release.js'), 'utf8');
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(core, /startMessageOrdering/);
  assert.doesNotMatch(core, /rim-global-chat-order/);
  assert.doesNotMatch(core, /last_read_at:new Date\(\)\.toISOString\(\)/);
  assert.match(core, /const markConversationRead=\(\)=>window\.markConversationRead\?\./);
  assert.doesNotMatch(html, /assets\/js\/legacy\/01-rim-halloween-ornaments-2026-11\.js/);
});


test('read receipt rendering and Realtime ownership are migrated out of legacy scripts', async () => {
  const [legacy25, legacy06, app, runtime, controller] = await Promise.all([
    readFile(path.join(root, 'assets/js/legacy/25-rim-stability-consolidated-20261105.js'), 'utf8'),
    readFile(path.join(root, 'assets/js/legacy/06-legacy-06.js'), 'utf8'),
    readFile(path.join(root, 'src/app.js'), 'utf8'),
    readFile(path.join(root, 'src/composition/chat-runtime-surface.js'), 'utf8'),
    readFile(path.join(root, 'src/application/read-receipt-controller.js'), 'utf8')
  ]);
  assert.doesNotMatch(legacy25, /rim-read-state-|readStateChannel|Sent tick is immediate/);
  assert.doesNotMatch(legacy25, /rim-send-check/);
  assert.doesNotMatch(legacy06, /prefs\.showRead|rim-read-check/);
  assert.match(app, /bindChatRuntimeSurface/);
  assert.match(runtime, /ReadReceiptController/);
  assert.match(runtime, /readReceipts/);
  assert.match(controller, /bind\(/);
  assert.match(app, /bindConversationOpenSurface/);
  const openSurfaceFile = await readFile(path.join(root, 'src/composition/conversation-open-surface.js'), 'utf8');
  assert.match(openSurfaceFile, /openConversation/);
  assert.match(app, /bindMessageTimelineSurface/);
  const timelineSurface = await readFile(path.join(root, 'src/composition/message-timeline-surface.js'), 'utf8');
  assert.match(timelineSurface, /rimLoadMessagesStable/);
  assert.match(timelineSurface, /loadMessages/);
  assert.match(timelineSurface, /markConversationRead/);
  assert.match(timelineSurface, /loadLatest/);
});
