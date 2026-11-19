import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChannelTitle,
  normalizeChannelHandle,
  normalizeChannelPostBody,
  canPublishToChannel
} from '../src/domain/channel.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('channel title and handle validation', () => {
  assert.equal(normalizeChannelTitle('  РИМ  ').ok, true);
  assert.equal(normalizeChannelTitle('').ok, false);
  assert.equal(normalizeChannelHandle('Imperial_1').ok, true);
  assert.equal(normalizeChannelHandle('ab').ok, false);
  assert.equal(normalizeChannelPostBody('hello').value, 'hello');
  assert.equal(normalizeChannelPostBody('').ok, false);
  assert.equal(canPublishToChannel({ role: 'editor' }), true);
  assert.equal(canPublishToChannel({ role: 'reader' }), false);
});

test('channel domain is consumed by feed and command service', () => {
  const feed = readFileSync(join(root, 'src/application/channel-feed-controller.js'), 'utf8');
  const cmd = readFileSync(join(root, 'src/application/channel-command-service.js'), 'utf8');
  assert.match(feed, /normalizeChannelPostBody/);
  assert.match(cmd, /normalizeChannelTitle/);
  assert.match(cmd, /normalizeChannelHandle/);
});

test('core-release defers presence when modular owns it', () => {
  const core = readFileSync(join(root, 'assets/js/core/rim-core-release.js'), 'utf8');
  assert.match(core, /startPresence\(\)\{if\(window\.__RIM_OWN_PRESENCE_OWNED\)return;/);
});
