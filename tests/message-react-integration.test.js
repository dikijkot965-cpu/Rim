import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('app routes react and reply through modular controllers', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const commands = readFileSync(join(root, 'src/composition/message-commands-surface.js'), 'utf8');
  const timeline = readFileSync(join(root, 'src/composition/message-timeline-surface.js'), 'utf8');
  assert.match(app, /bindMessageCommandsSurface/);
  assert.match(app, /bindMessageTimelineSurface/);
  assert.match(commands, /reactToMessage/);
  assert.match(timeline, /ReplyTargetController/);
  assert.match(timeline, /setReply/);
  assert.match(app, /4\.0\.0-iteration\.122/);
});
