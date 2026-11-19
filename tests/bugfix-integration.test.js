import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('modal stacks above channel full page', () => {
  const css = readFileSync(join(root, 'assets/css/rim-architecture.css'), 'utf8');
  assert.match(css, /#modalRoot\{z-index:11000/);
});

test('send path prefers local append over full reload', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const surface = readFileSync(join(root, 'src/composition/message-commands-surface.js'), 'utf8');
  const entrypoints = readFileSync(join(root, 'src/composition/legacy-entrypoint-surface.js'), 'utf8');
  assert.match(app, /bindMessageCommandsSurface/);
  assert.match(surface, /applyLocal:/);
  assert.match(entrypoints, /hydrateActivity/);
  assert.match(app, /4\.0\.0-iteration\.122/);
  const cmd = readFileSync(join(root, 'src/application/message-command-service.js'), 'utf8');
  assert.match(cmd, /applyLocal\(sentMessage/);
});

test('favorites row is not force-prepended', () => {
  const list = readFileSync(join(root, 'src/application/conversation-list-controller.js'), 'utf8');
  assert.match(list, /favoritesActivityTime/);
  assert.match(list, /insertBefore\(row/);
  assert.doesNotMatch(list, /list\.prepend\(row\)/);
});

test('channel settings resolves channel from full page dataset', () => {
  const settings = readFileSync(join(root, 'src/application/channel-settings-controller.js'), 'utf8');
  assert.match(settings, /#resolveChannel/);
  assert.match(settings, /rimChannelFull/);
  const feed = readFileSync(join(root, 'src/application/channel-feed-controller.js'), 'utf8');
  assert.match(feed, /dataset\.channelId/);
});
