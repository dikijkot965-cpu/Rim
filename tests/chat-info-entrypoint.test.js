import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('chat info controller is wired to the global info-button entrypoint', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ ChatInfoController \} from '\.\/application\/chat-info-controller\.js'/);
  assert.match(app, /new ChatInfoController\(/);
  assert.match(app, /window\.__RIM_CHAT_INFO_OWNED = true/);
  assert.match(app, /window\.openChatInfo = async \(\) =>/);
  assert.match(app, /chatInfoController\.open\(\)/);
});
