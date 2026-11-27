import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ComposeChatService } from '../src/application/compose-chat-service.js';
import { Ok } from '../src/core/result.js';
import { ConversationShellController } from '../src/application/conversation-shell-controller.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('global search uses the real search controller and valid Supabase columns', async () => {
  const [html, search] = await Promise.all([
    read('../index.html'),
    read('../src/application/search-controller.js')
  ]);
  assert.match(html, /id="rimSearchBtn" onclick="rimSearch\(\)"/);
  assert.match(search, /\.eq\('is_private', false\)/);
  assert.match(search, /select\('id,title,avatar_path,is_private,e2e_mode'\)/);
  assert.doesNotMatch(search, /\.select\('id,title,username,avatar_path'\)/);
  assert.doesNotMatch(search, /\.eq\('is_public', true\)/);
});

test('secret direct chat creation reuses DirectChatService and is exposed in the create menu', async () => {
  const html = await read('../index.html');
  assert.match(html, /data-create="secret-direct"/);
  assert.match(html, /newSecretDirectChat/);
  let target = null;
  const service = new ComposeChatService({
    client: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'peer-id', username: 'peer_user' }, error: null }) }) }) }) },
    getUser: () => ({ id: 'self-id' }),
    prompt: () => '@peer_user',
    startSecretWith: async id => { target = id; return Ok({ conversationId: 'secret-id' }); }
  });
  const result = await service.newSecretDirect();
  assert.equal(result.ok, true);
  assert.equal(target, 'peer-id');
  assert.equal(result.value.conversationId, 'secret-id');
});

test('conversation changes always clear the previous group or peer avatar before async resolution', () => {
  const avatar = {
    textContent: '',
    dataset: { rimAvatarSignature: 'old', rimAvatarReady: '1' },
    replaceChildren() { this.cleared = true; },
    setAttribute() {},
    style: {}
  };
  const title = { textContent: '', style: {}, setAttribute() {} };
  const status = { textContent: '' };
  const documentRef = { getElementById(id) { return ({ chatHeadAvatar: avatar, chatHeadName: title, chatHeadStatus: status })[id] || null; } };
  const controller = new ConversationShellController({ documentRef, windowRef: {} });
  controller.paintProvisionalHeader({ id: 'g2', type: 'group', title: 'Новая группа' });
  assert.equal(avatar.cleared, true);
  assert.equal(avatar.textContent, '♧');
  assert.equal('rimAvatarSignature' in avatar.dataset, false);
});

test('private group E2E control lives in chat information, not the header', async () => {
  const [info, app, html] = await Promise.all([
    read('../src/application/chat-info-controller.js'),
    read('../src/app.js'),
    read('../index.html')
  ]);
  assert.match(info, /rimEnableE2EScope\('group'/);
  assert.match(info, /conversation\.is_private === true/);
  assert.match(app, /const visible = conversation\?\.type === 'direct'/);
  assert.match(html, /id="rimE2EVerifyBtn"/);
});

test('channel management is based on channel ownership and membership roles only', async () => {
  const source = await read('../src/application/channel-feed-controller.js');
  assert.match(source, /const manager = isOwner \|\| \['admin', 'moderator'\]\.includes\(role\)/);
  assert.match(source, /const canPost = isOwner \|\| role === 'admin'/);
  assert.doesNotMatch(source, /this\.isImperator/);
});

test('More contains direct Zladen access and a group picker', async () => {
  const [nav, app] = await Promise.all([
    read('../src/application/navigation-pages-controller.js'),
    read('../src/app.js')
  ]);
  assert.match(nav, /rimOpenZladenChat/);
  assert.match(nav, /rimOpenZladenGroupPicker/);
  assert.match(app, /window\.rimOpenZladenChat = async/);
  assert.match(app, /window\.rimOpenZladenGroupPicker = async/);
  assert.match(app, /rimGroupAddZladen/);
});

test('profile avatar resolves profile avatar_path through the private avatars bucket and avoids polling', async () => {
  const [html, settings] = await Promise.all([
    read('../index.html'),
    read('../src/composition/settings-surface.js')
  ]);
  assert.match(html, /createSignedUrl\(profile\.avatar_path, 1800\)/);
  assert.match(html, /rim:profile-updated/);
  assert.doesNotMatch(html, /setInterval\(refreshAvatar/);
  assert.match(settings, /rim:profile-updated/);
});

test('feed rendering uses a Reddit-like vote rail and preserves comments and retry feedback', async () => {
  const [html, css] = await Promise.all([
    read('../index.html'),
    read('../assets/css/rim.css')
  ]);
  assert.match(html, /rim-feed-vote-rail/);
  assert.match(html, /data-action="comments"/);
  assert.match(html, /data-rim-feed-retry/);
  assert.equal((html.match(/window\.renderFeedList\s*=\s*(?:async\s+)?function/g) || []).length, 1);
  assert.match(css, /\.rim-feed-vote-rail/);
  assert.match(css, /\.rim-feed-post-content/);
});

test('Chats has a bottom-right floating create action and a single Zladen route in More', async () => {
  const [html, nav, css] = await Promise.all([
    read('../index.html'),
    read('../src/application/navigation-pages-controller.js'),
    read('../assets/css/rim.css')
  ]);
  assert.match(html, /id="rimCreateFab"/);
  assert.match(css, /\.rim-create-fab/);
  assert.match(html, /\['rimCreateHandle', 'rimCreateFab'\]/);
  const more = nav.slice(nav.indexOf('openMore()'), nav.indexOf('openTools()'));
  assert.equal((more.match(/action: 'rimOpenZladenChat'/g) || []).length, 2);
  assert.equal((more.match(/action: 'rimOpenZladenGroupPicker'/g) || []).length, 2);
});
