import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Zladen Auth provisioning respects Supabase Auth 72-character password limit', async () => { const s = await read('supabase/functions/rim-zladen/index.ts'); assert.match(s, /const password\s*=\s*randomToken\(\)\s*;/); assert.doesNotMatch(s, /randomToken\(\)\s*\+\s*randomToken\(\)/); });
test('floating create menu has a real group creation route', async () => { const s = await read('src/composition/groups-surface.js'); assert.match(s, /win\.rimOpenGroupCreate\s*=\s*openGroupCreate/); assert.match(s, /win\.newGroupChat\s*=\s*openGroupCreate/); assert.match(s, /rimCreateGroup\(\)/); assert.match(s, /groupCommands\.create\(/); });
test('Favorites row is inserted after either modular or legacy conversation rendering', async () => { const s = await read('src/application/conversation-list-controller.js'); const load = s.slice(s.indexOf('async load()'), s.indexOf('invalidate()')); assert.match(load, /renderConversationList\(\)/); assert.match(load, /this\.ensureFavoritesRow\(\)/); });
test('music component claims musicSection synchronously during composition', async () => { const s = await read('src/composition/features-surface.js'); const mount=s.indexOf("const musicSection = doc.getElementById('musicSection')"); const load=s.indexOf('win.loadMusic = async'); assert.ok(mount>=0 && load>mount); assert.match(s.slice(mount,load), /musicSection\.replaceChildren\(musicRoot\)/); });
test('Telegram settings opens profile editor from Account', async () => { const s=await read('index.html'); assert.match(s,/if \(action === 'account'\)[\s\S]{0,180}window\.openProfile/); assert.match(s,/id="rimTgProfileCard" data-tg-action="account"/); });
test('feed personalization is account-scoped and persisted in Supabase', async () => { const s=await read('index.html'); assert.match(s,/FEED_PREFS_KEY\}:\$\{rimUserId\(\) \|\| 'guest'\}/); assert.match(s,/from\('rim_user_feed_preferences'\)\.upsert/); assert.match(s,/feed\.preferences\.load\.failed/); });

test('avatar processor rejects unsupported and oversized files', async () => {
  const { prepareAvatarImage } = await import('../src/application/avatar-image-processor.js');
  await assert.rejects(() => prepareAvatarImage({ type: 'image/svg+xml', size: 12 }), /JPG, PNG, WebP и GIF/);
  await assert.rejects(() => prepareAvatarImage({ type: 'image/png', size: 4 * 1024 * 1024 }), /3 МБ/);
});

test('avatar processor center-crops and releases the decoded bitmap', async () => {
  const { prepareAvatarImage } = await import('../src/application/avatar-image-processor.js');
  let drawArgs; let closed = false;
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (...args) => { drawArgs = args; } }), toBlob: callback => callback(new Blob(['webp'], { type: 'image/webp' })) };
  const bitmap = { width: 800, height: 400, close: () => { closed = true; } };
  const file = new Blob(['image'], { type: 'image/png' });
  const result = await prepareAvatarImage(file, { documentRef: { createElement: () => canvas }, createImageBitmapRef: async () => bitmap });
  assert.equal(result.type, 'image/webp');
  assert.equal(result.name, 'rim-avatar.webp');
  assert.deepEqual(drawArgs, [bitmap, 200, 0, 400, 400, 0, 0, 512, 512]);
  assert.equal(closed, true);
});
