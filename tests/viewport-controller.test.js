import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewportController } from '../src/application/viewport-controller.js';

test('viewport controller tracks Android visual viewport height and top offset', () => {
  const values = new Map();
  const removed = [];
  const root = { style: {
    setProperty(key, value) { values.set(key, value); },
    removeProperty(key) { removed.push(key); values.delete(key); }
  } };
  const vvListeners = new Map();
  const winListeners = new Map();
  const input = { addEventListener() {}, removeEventListener() {} };
  const doc = { documentElement: root, activeElement: null, getElementById: id => id === 'messageInput' ? input : null };
  const vv = {
    height: 480,
    offsetTop: 18,
    addEventListener(name, fn) { vvListeners.set(name, fn); },
    removeEventListener(name) { vvListeners.delete(name); }
  };
  const win = {
    visualViewport: vv,
    innerHeight: 900,
    addEventListener(name, fn) { winListeners.set(name, fn); },
    removeEventListener(name) { winListeners.delete(name); },
    setTimeout(fn) { fn(); },
    requestAnimationFrame(fn) { fn(); }
  };
  const controller = new ViewportController({ documentRef: doc, windowRef: win });
  controller.install();
  assert.equal(values.get('--app-height'), '480px');
  assert.equal(values.get('--app-offset-top'), '18px');
  vv.height = 410;
  vv.offsetTop = 24;
  controller.update();
  assert.equal(values.get('--app-height'), '410px');
  assert.equal(values.get('--app-offset-top'), '24px');
  controller.dispose();
  assert.equal(vvListeners.size, 0);
  assert.equal(winListeners.size, 0);
  assert.ok(removed.includes('--app-height'));
  assert.ok(removed.includes('--app-offset-top'));
});
