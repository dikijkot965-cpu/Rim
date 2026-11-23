import test from 'node:test';
import assert from 'node:assert/strict';
import { ZladenSettingsController } from '../src/application/zladen-settings-controller.js';

test('Zladen owner settings are denied to non-owners', async () => {
  let notified = '';
  const controller = new ZladenSettingsController({ service: {}, isOwner: () => false, notify: value => { notified = value; }, documentRef: {} });
  assert.equal(await controller.open(), false);
  assert.match(notified, /только владельцу/);
});
