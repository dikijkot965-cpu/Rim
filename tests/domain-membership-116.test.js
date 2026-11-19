import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMemberRole,
  canModerateMembers,
  canManageSettings,
  canRemoveMember
} from '../src/domain/membership.js';
import { normalizeMessageBody } from '../src/domain/message.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('membership role rules', () => {
  assert.equal(normalizeMemberRole('Admin'), 'admin');
  assert.equal(canModerateMembers('moderator'), true);
  assert.equal(canManageSettings('member'), false);
  assert.equal(canRemoveMember({ actorRole: 'admin', targetRole: 'member' }), true);
  assert.equal(canRemoveMember({ actorRole: 'admin', targetRole: 'owner' }), false);
  assert.equal(canRemoveMember({ actorRole: 'owner', targetRole: 'admin', actorId: '1', targetId: '1' }), false);
});

test('edit path uses message domain', () => {
  const src = readFileSync(join(root, 'src/application/message-command-service.js'), 'utf8');
  assert.match(src, /async edit\([\s\S]*normalizeMessageBody/s);
  assert.equal(normalizeMessageBody('  hi  ').body, 'hi');
});

test('core-release defers voice send when modular owns voice', () => {
  const core = readFileSync(join(root, 'assets/js/core/rim-core-release.js'), 'utf8');
  assert.match(core, /__RIM_VOICE_OWNED/);
  assert.match(core, /rimSendVoice/);
});
