import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Zladen Auth provisioning respects Supabase Auth 72-character password limit', async () => { const s = await read('supabase/functions/rim-zladen/index.ts'); assert.match(s, /const password\s*=\s*randomToken\(\)\s*;/); assert.doesNotMatch(s, /randomToken\(\)\s*\+\s*randomToken\(\)/); });
test('floating create menu has a real group creation route', async () => { const s = await read('src/composition/groups-surface.js'); assert.match(s, /win\.newGroupChat\s*=\s*\(\)\s*=>/); assert.match(s, /rimCreateGroup\(\)/); assert.match(s, /groupCommands\.create\(/); });
test('Favorites row is inserted after either modular or legacy conversation rendering', async () => { const s = await read('src/application/conversation-list-controller.js'); const load = s.slice(s.indexOf('async load()'), s.indexOf('invalidate()')); assert.match(load, /renderConversationList\(\)/); assert.match(load, /this\.ensureFavoritesRow\(\)/); });
test('music component claims musicSection synchronously during composition', async () => { const s = await read('src/composition/features-surface.js'); const mount=s.indexOf("const musicSection = doc.getElementById('musicSection')"); const load=s.indexOf('win.loadMusic = async'); assert.ok(mount>=0 && load>mount); assert.match(s.slice(mount,load), /musicSection\.replaceChildren\(musicRoot\)/); });
test('Telegram settings opens profile editor from Account', async () => { const s=await read('index.html'); assert.match(s,/if \(action === 'account'\)[\s\S]{0,180}window\.openProfile/); assert.match(s,/id="rimTgProfileCard" data-tg-action="account"/); });
test('feed personalization is account-scoped and persisted in Supabase', async () => { const s=await read('index.html'); assert.match(s,/FEED_PREFS_KEY\}:\$\{rimUserId\(\) \|\| 'guest'\}/); assert.match(s,/from\('rim_user_feed_preferences'\)\.upsert/); assert.match(s,/feed\.preferences\.load\.failed/); });
