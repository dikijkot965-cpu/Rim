import test from 'node:test';
import assert from 'node:assert/strict';
import { SettingsShellController } from '../src/application/settings-shell-controller.js';

test('open paints theme language privacy and blocks controls', () => {
  const pages = [];
  const controller = new SettingsShellController({
    getTheme: () => 'dark',
    getLanguage: () => 'en',
    getPrivacy: () => ({ showOnline: false, allowForward: true, showRead: false }),
    showModal: html => pages.push(html),
    documentRef: { querySelector() { return null; }, getElementById() { return null; } },
    windowRef: {}
  });
  controller.open();
  assert.match(pages[0], /modal-title">Настройки/);
  assert.match(pages[0], /value="dark" selected/);
  assert.match(pages[0], /value="en" selected/);
  assert.match(pages[0], /id="rimOnline"/);
  assert.match(pages[0], /data-rim-settings-action="blocks"/);
  assert.match(pages[0], /data-rim-settings-action="save-privacy"/);
});
