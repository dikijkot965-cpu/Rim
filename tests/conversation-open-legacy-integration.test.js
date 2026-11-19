import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(join(root, 'assets/js/legacy/24-rim-architecture-rebuild-2026-11-05.js'), 'utf8');
const app = fs.readFileSync(join(root, 'src/app.js'), 'utf8');
const openSurface = fs.readFileSync(join(root, 'src/composition/conversation-open-surface.js'), 'utf8');

test('legacy opener invalidates stale continuations after asynchronous boundaries', () => {
  const opener = source.slice(source.indexOf('let conversationOpenGeneration='), source.indexOf('// -------------------- Forward with optional hidden sender'));
  assert.match(opener, /const generation=\+\+conversationOpenGeneration/);
  assert.ok((opener.match(/if\(!isCurrent\(\)\)return;/g) || []).length >= 5);
  assert.match(opener, /if\(!isCurrent\(\)\)return;console\.error/);
});

test('legacy opener resolves uncached chats through the modular membership repository', () => {
  assert.match(app, /window\.rimResolveConversationForOpen\s*=\s*async/);
  assert.match(app, /repository\.getAccessibleConversation\(conversationId, userId\)/);
  assert.match(source, /window\.rimResolveConversationForOpen\(id,u\.id\)/);
});

test('stable timeline loader is the sole read-cursor write in the legacy open path', () => {
  const opener = source.slice(source.indexOf('let conversationOpenGeneration='), source.indexOf('// -------------------- Forward with optional hidden sender'));
  assert.match(opener, /rimLoadMessagesStable/);
  assert.doesNotMatch(opener, /window\.markConversationRead\?\./);
});

test('superseded legacy 17 opener wrapper and duplicate membership query are retired', () => {
  const legacy17 = fs.readFileSync(join(root, 'assets/js/legacy/17-rim-stability-channel-management.js'), 'utf8');
  assert.doesNotMatch(legacy17, /baseOpen=window\.openConversation/);
  assert.doesNotMatch(legacy17, /__rimOpenChatSafe/);
  assert.match(legacy17, /Conversation navigation is owned by the principal opener/);
});

test('legacy opener delegates active conversation and reply-target state to the navigation controller', () => {
  const opener = source.slice(source.indexOf('let conversationOpenGeneration='), source.indexOf('// -------------------- Forward with optional hidden sender'));
  assert.match(opener, /rimBeginConversationNavigation\?\./);
  assert.match(opener, /rimCommitConversationSelection\(navigationToken,chat\)/);
  assert.doesNotMatch(opener, /try\{activeConversation=chat\}/);
  assert.match(app, /bindConversationOpenSurface/);
  assert.match(openSurface, /ConversationNavigationController/);
});

test('legacy context exposes controlled setters for active conversation and reply target', () => {
  const html = fs.readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /setActiveConversation:\s*conversation\s*=>\s*\{\s*activeConversation\s*=/);
  assert.match(html, /setReplyTarget:\s*target\s*=>\s*\{\s*replyTarget\s*=/);
});
