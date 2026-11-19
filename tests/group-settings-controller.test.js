import test from 'node:test';
import assert from 'node:assert/strict';
import { GroupSettingsController, renderGroupSettingsModal } from '../src/application/group-settings-controller.js';
import { Ok, Err } from '../src/core/result.js';

function createProjection(overrides = {}) {
  return {
    group: {
      id: 'g1',
      title: 'Гвардия',
      description: 'Описание <script>',
      is_private: true,
      created_by: 'owner-1',
      invite_code: 'INVITE-1',
      avatar_path: null,
      type: 'group',
      ...(overrides.group || {})
    },
    members: overrides.members || [
      { user_id: 'owner-1', role: 'owner', joined_at: '2026-01-01' },
      { user_id: 'admin-2', role: 'admin', joined_at: '2026-01-02' }
    ],
    profileById: overrides.profileById || {
      'owner-1': { id: 'owner-1', username: 'tsar', display_name: 'Император' },
      'admin-2': { id: 'admin-2', username: 'aide', display_name: 'Помощник' }
    },
    ownMembership: overrides.ownMembership || { user_id: 'owner-1', role: 'owner' },
    isCreator: overrides.isCreator !== undefined ? overrides.isCreator : true,
    isManager: overrides.isManager !== undefined ? overrides.isManager : true
  };
}

test('renderGroupSettingsModal escapes dynamic values and avoids inline ID handlers', () => {
  const html = renderGroupSettingsModal(createProjection(), 'owner-1');
  assert.match(html, /Настройки группы/);
  assert.match(html, /data-rim-group-action="save"/);
  assert.match(html, /data-rim-group-action="set-role"/);
  assert.match(html, /data-group-id="g1"/);
  assert.doesNotMatch(html, /onclick="rimSaveGroupSettings/);
  assert.doesNotMatch(html, /onclick="rimGroupSetRole/);
  assert.match(html, /Описание &lt;script&gt;/);
  assert.match(html, /Код приглашения: INVITE-1/);
  assert.match(html, /Передать владение/);
});

test('renderGroupSettingsModal hides transfer for non-creators', () => {
  const html = renderGroupSettingsModal(createProjection({ isCreator: false }), 'admin-2');
  assert.doesNotMatch(html, /Передать владение/);
});

test('GroupSettingsController opens modal for managers and binds delegated actions', async () => {
  const shown = [];
  const repository = {
    getSettingsProjection: async () => Ok(createProjection())
  };
  const documentRef = {
    querySelector(selector) {
      if (String(selector).includes('data-rim-group-settings')) {
        return {
          contains() { return true; },
          addEventListener() {},
          removeEventListener() {}
        };
      }
      return null;
    },
    getElementById() { return null; }
  };
  const windowRef = {
    conversations: [{ id: 'g1', type: 'group' }],
    rimSaveGroupSettings: null,
    showModal: null
  };

  const controller = new GroupSettingsController({
    repository,
    getUser: () => ({ id: 'owner-1' }),
    documentRef,
    windowRef,
    showModal: html => shown.push(html),
    notify: () => {}
  });

  const projection = await controller.open('g1');
  assert.ok(projection);
  assert.equal(shown.length, 1);
  assert.match(shown[0], /data-rim-group-action="save"/);
  controller.dispose();
});

test('GroupSettingsController rejects non-managers without opening modal', async () => {
  const shown = [];
  const messages = [];
  const repository = {
    getSettingsProjection: async () => Ok(createProjection({
      isManager: false,
      isCreator: false,
      ownMembership: { user_id: 'member-9', role: 'member' }
    }))
  };

  const controller = new GroupSettingsController({
    repository,
    getUser: () => ({ id: 'member-9' }),
    documentRef: { querySelector() { return null; }, getElementById() { return null; } },
    windowRef: { conversations: [{ id: 'g1', type: 'group' }] },
    showModal: html => shown.push(html),
    notify: message => messages.push(message)
  });

  const result = await controller.open('g1');
  assert.equal(result, null);
  assert.equal(shown.length, 0);
  assert.match(messages.join(' '), /владельцу и администраторам/);
});

test('GroupSettingsController discards stale responses', async () => {
  const shown = [];
  let resolveFirst;
  const repository = {
    getSettingsProjection: () => new Promise(resolve => {
      resolveFirst = () => resolve(Ok(createProjection()));
    })
  };

  const controller = new GroupSettingsController({
    repository,
    getUser: () => ({ id: 'owner-1' }),
    documentRef: { querySelector() { return null; }, getElementById() { return null; } },
    windowRef: { conversations: [{ id: 'g1', type: 'group' }] },
    showModal: html => shown.push(html),
    notify: () => {}
  });

  const pending = controller.open('g1');
  controller.invalidate();
  resolveFirst();
  const result = await pending;
  assert.equal(result, null);
  assert.equal(shown.length, 0);
});

test('GroupSettingsController surfaces repository errors', async () => {
  const messages = [];
  const repository = {
    getSettingsProjection: async () => Err(new Error('network down'))
  };
  const controller = new GroupSettingsController({
    repository,
    getUser: () => ({ id: 'owner-1' }),
    documentRef: { querySelector() { return null; }, getElementById() { return null; } },
    windowRef: { conversations: [{ id: 'g1', type: 'group' }] },
    showModal: () => {},
    notify: message => messages.push(message)
  });

  const result = await controller.open('g1');
  assert.equal(result, null);
  assert.match(messages.join(' '), /network down/);
});
