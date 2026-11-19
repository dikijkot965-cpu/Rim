import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('legacy dual-binds respect modular ownership flags for chat info and shell chrome', () => {
  const legacy03 = readFileSync(join(root, 'assets/js/legacy/03-legacy-03.js'), 'utf8');
  assert.match(legacy03, /__RIM_CHAT_INFO_OWNED/);
  assert.match(legacy03, /__RIM_CONVERSATION_SHELL_OWNED/);

  const restore = readFileSync(join(root, 'assets/js/legacy/12-rim-restore-layer-2026-11.js'), 'utf8');
  assert.match(restore, /__RIM_CHAT_INFO_OWNED/);

  const legacy06 = readFileSync(join(root, 'assets/js/legacy/06-legacy-06.js'), 'utf8');
  assert.match(legacy06, /__RIM_CONVERSATION_SHELL_OWNED/);

  const legacy25 = readFileSync(join(root, 'assets/js/legacy/25-rim-stability-consolidated-20261105.js'), 'utf8');
  assert.match(legacy25, /__RIM_TYPING_PRESENCE_OWNED/);
  assert.match(legacy25, /__RIM_CONVERSATION_SHELL_OWNED/);
  assert.match(legacy25, /__RIM_SETTINGS_SHELL_OWNED/);
  assert.match(legacy25, /__RIM_CHANNEL_SETTINGS_OWNED/);
  assert.match(legacy25, /__RIM_OPEN_CONVERSATION_OWNED/);
  assert.match(legacy25, /__RIM_FORWARD_OWNED/);

  const legacy18 = readFileSync(join(root, 'assets/js/legacy/18-rim-update-core.js'), 'utf8');
  assert.match(legacy18, /__RIM_CONVERSATION_SHELL_OWNED/);
  assert.match(legacy18, /__RIM_OPEN_CONVERSATION_OWNED/);
  assert.match(legacy18, /__RIM_MESSAGE_TIMELINE_OWNED/);

  const legacy24 = readFileSync(join(root, 'assets/js/legacy/24-rim-architecture-rebuild-2026-11-05.js'), 'utf8');
  assert.match(legacy24, /__RIM_CONVERSATION_SHELL_OWNED/);
  assert.match(legacy24, /__RIM_OPEN_CONVERSATION_OWNED/);
  assert.match(legacy24, /__RIM_FORWARD_OWNED/);
});

test('composition roots claim ownership flags for settings surface and chat audience', () => {
  const audience = readFileSync(join(root, 'src/composition/chat-audience.js'), 'utf8');
  assert.match(audience, /__RIM_CHAT_INFO_OWNED/);
  assert.match(audience, /__RIM_PINNED_MESSAGES_OWNED/);

  const settings = readFileSync(join(root, 'src/composition/settings-surface.js'), 'utf8');
  assert.match(settings, /__RIM_APPEARANCE_OWNED/);
  assert.match(settings, /__RIM_SETTINGS_SHELL_OWNED/);
  assert.match(settings, /__RIM_BLOCK_LIST_OWNED/);
  assert.match(settings, /__RIM_PROFILE_OWNED/);
  assert.match(settings, /__RIM_PRIVACY_SETTINGS_OWNED/);

  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  assert.match(app, /bindChatAudience/);
  assert.match(app, /bindSettingsSurface/);
});

test('legacy 03 skips open and render dual-bind when modular owns them', () => {
  const legacy03 = readFileSync(join(root, 'assets/js/legacy/03-legacy-03.js'), 'utf8');
  assert.match(legacy03, /__RIM_OPEN_CONVERSATION_OWNED/);
  assert.match(legacy03, /__RIM_MESSAGE_DECORATIONS_OWNED/);
  assert.match(legacy03, /__RIM_CHANNEL_FEED_OWNED/);
});

test('legacy 12 and 24 respect forward and admin ownership flags', () => {
  const legacy12 = readFileSync(join(root, 'assets/js/legacy/12-rim-restore-layer-2026-11.js'), 'utf8');
  assert.match(legacy12, /__RIM_ADMIN_COMMANDS_OWNED/);
  const legacy24 = readFileSync(join(root, 'assets/js/legacy/24-rim-architecture-rebuild-2026-11-05.js'), 'utf8');
  assert.match(legacy24, /__RIM_FORWARD_OWNED/);
  const legacy25 = readFileSync(join(root, 'assets/js/legacy/25-rim-stability-consolidated-20261105.js'), 'utf8');
  assert.match(legacy25, /__RIM_FORWARD_OWNED/);
});

test('legacy 06 respects compose and open ownership flags', () => {
  const legacy06 = readFileSync(join(root, 'assets/js/legacy/06-legacy-06.js'), 'utf8');
  assert.match(legacy06, /__RIM_COMPOSE_CHAT_OWNED/);
  assert.match(legacy06, /__RIM_OPEN_CONVERSATION_OWNED/);
});

test('legacy 05 respects nav and profile ownership flags', () => {
  const legacy05 = readFileSync(join(root, 'assets/js/legacy/05-legacy-05.js'), 'utf8');
  assert.match(legacy05, /__RIM_NAV_PAGES_OWNED/);
  assert.match(legacy05, /__RIM_PROFILE_OWNED/);
});

test('legacy 08 09 11 13 respect nav settings reports admin ownership', () => {
  const legacy08 = readFileSync(join(root, 'assets/js/legacy/08-rim-november-correction-js.js'), 'utf8');
  assert.match(legacy08, /__RIM_NAV_PAGES_OWNED/);
  const legacy09 = readFileSync(join(root, 'assets/js/legacy/09-rim-grand-expansion-v3-script.js'), 'utf8');
  assert.match(legacy09, /__RIM_SETTINGS_SHELL_OWNED/);
  const legacy11 = readFileSync(join(root, 'assets/js/legacy/11-rim-report-context-upgrade-2026-11.js'), 'utf8');
  assert.match(legacy11, /__RIM_REPORTS_OWNED/);
  const legacy13 = readFileSync(join(root, 'assets/js/legacy/13-rim-update-5-patch.js'), 'utf8');
  assert.match(legacy13, /__RIM_ADMIN_COMMANDS_OWNED/);
  const legacy20 = readFileSync(join(root, 'assets/js/legacy/20-rim-update-groups.js'), 'utf8');
  assert.match(legacy20, /__RIM_GROUP_SETTINGS_OWNED/);
});

test('legacy 14 15 17 21 respect renderer channel open search ownership', () => {
  const legacy14 = readFileSync(join(root, 'assets/js/legacy/14-rim-update5-performance.js'), 'utf8');
  assert.match(legacy14, /__RIM_MESSAGE_LIST_RENDERER_OWNED/);
  assert.match(legacy14, /__RIM_CHANNEL_FEED_OWNED/);
  const legacy15 = readFileSync(join(root, 'assets/js/legacy/15-rim-update6-unlimited-history.js'), 'utf8');
  assert.match(legacy15, /__RIM_MESSAGE_TIMELINE_OWNED/);
  const legacy17 = readFileSync(join(root, 'assets/js/legacy/17-rim-stability-channel-management.js'), 'utf8');
  assert.match(legacy17, /__RIM_CHANNEL_FEED_OWNED/);
  const legacy21 = readFileSync(join(root, 'assets/js/legacy/21-rim-update-discovery-music.js'), 'utf8');
  assert.match(legacy21, /__RIM_SEARCH_OWNED/);
});

test('legacy 09 and 12 respect message commands ownership for send', () => {
  const legacy09 = readFileSync(join(root, 'assets/js/legacy/09-rim-grand-expansion-v3-script.js'), 'utf8');
  assert.match(legacy09, /__RIM_MESSAGE_COMMANDS_OWNED/);
  const legacy12 = readFileSync(join(root, 'assets/js/legacy/12-rim-restore-layer-2026-11.js'), 'utf8');
  assert.match(legacy12, /__RIM_MESSAGE_COMMANDS_OWNED/);
});
