import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ChannelSettingsController,
  renderChannelSettingsShell,
  renderChannelMembers
} from '../src/application/channel-settings-controller.js';
import { Ok, Err } from '../src/core/result.js';

test('settings shell escapes values and uses data actions', () => {
  const html = renderChannelSettingsShell({
    id: 'ch1',
    title: 'News <x>',
    description: 'd',
    username: 'news',
    is_public: true
  });
  assert.match(html, /News &lt;x&gt;/);
  assert.match(html, /data-rim-cs-action="save"/);
  assert.doesNotMatch(html, /onclick="rimSaveChannelSettings/);
});

test('member rows hide moderation for owner', () => {
  const html = renderChannelMembers([
    { user_id: 'owner', role: 'owner', profile: { username: 'tsar', display_name: 'Tsar' } },
    { user_id: 'u2', role: 'member', profile: { username: 'm', display_name: 'Member' } }
  ], { id: 'ch1', owner_id: 'owner' });
  assert.doesNotMatch(html, /data-user-id="owner"/);
  assert.match(html, /data-mod-action="mute"/);
});

test('controller opens for managers and hydrates ancillary panels', async () => {
  const shown = [];
  const groupSelect = { innerHTML: '', disabled: true };
  const membersPanel = { innerHTML: '' };
  const moderationPanel = { innerHTML: '' };
  const root = {
    querySelector(sel) {
      if (sel === '#rimChGroup') return groupSelect;
      if (sel === '#rimChannelSettingsMembers') return membersPanel;
      if (sel === '#rimChannelSettingsModeration') return moderationPanel;
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
    contains() { return true; }
  };
  const documentRef = {
    querySelector() { return root; },
    getElementById() { return null; }
  };
  const repository = {
    canManage: async () => Ok(true),
    getAncillary: async () => Ok({
      groups: [{ id: 'g1', title: 'G' }],
      groupsError: null,
      members: [{ user_id: 'u2', role: 'member', profile: { username: 'm', display_name: 'M' } }],
      moderation: [],
      moderationError: null
    })
  };
  const controller = new ChannelSettingsController({
    repository,
    getUser: () => ({ id: 'owner' }),
    getChannel: () => ({ id: 'ch1', owner_id: 'owner', title: 'Ch', description: '', username: '', is_public: true }),
    documentRef,
    windowRef: {},
    showModal: html => shown.push(html),
    notify: () => {}
  });
  const result = await controller.open();
  assert.ok(result);
  assert.equal(shown.length, 1);
  assert.equal(root.querySelector('#rimChGroup').disabled, false);
  controller.dispose();
});

test('controller rejects non-managers', async () => {
  const messages = [];
  const controller = new ChannelSettingsController({
    repository: { canManage: async () => Ok(false) },
    getUser: () => ({ id: 'u1' }),
    getChannel: () => ({ id: 'ch1', owner_id: 'owner' }),
    documentRef: { querySelector() { return null; }, getElementById() { return null; } },
    windowRef: {},
    showModal: () => {},
    notify: m => messages.push(m)
  });
  const result = await controller.open();
  assert.equal(result, null);
  assert.match(messages.join(' '), /администраторам/);
});
