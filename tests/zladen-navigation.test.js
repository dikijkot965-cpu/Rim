import test from 'node:test';
import assert from 'node:assert/strict';
import { NavigationPagesController } from '../src/application/navigation-pages-controller.js';

function renderTools(isOwner) {
  let html = '';
  const controller = new NavigationPagesController({
    windowRef: { isImperator: () => isOwner },
    documentRef: { getElementById: () => null, querySelector: () => null },
    openPage: (_title, content) => { html = content; }
  });
  controller.openTools();
  return html;
}

test('Zladen settings tile is visible only to the RIM owner', () => {
  assert.match(renderTools(true), /rimOpenZladenSettings/);
  assert.doesNotMatch(renderTools(false), /rimOpenZladenSettings/);
});
