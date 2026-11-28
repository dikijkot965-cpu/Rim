import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../assets/css/rim.css', import.meta.url), 'utf8');

test('Feed resolves the canonical Supabase client and authenticated user context', () => {
  assert.match(html, /window\.__RIM_LEGACY_CONTEXT\?\.db \|\| window\.db \|\| window\.supabaseClient/);
  assert.match(html, /const legacyUser = window\.__RIM_LEGACY_CONTEXT\?\.getUser\?\(\)/);
  assert.match(html, /if \(activeUserId && !activeDb\)/);
  assert.match(html, /Пост не сохранён локально/);
});

test('plus menu uses delegated click routing and stays available while a chat is open', () => {
  assert.match(html, /document\.addEventListener\('click',[\s\S]{0,300}#rimCreateHandle,#rimCreateFab/);
  assert.match(html, /window\.rimOpenCreateMenu/);
  assert.match(css, /#app\.rim-chat-focus \.rim-create-fab\s*\{\s*display:grid!important/s);
});

test('Android keyboard viewport controls the actual app container height', () => {
  assert.match(css, /height:var\(--app-height,100dvh\)!important/);
  assert.match(css, /top:var\(--app-offset-top,0px\)!important/);
  assert.match(html, /Настройки профиля · аватар, имя и username/);
});
