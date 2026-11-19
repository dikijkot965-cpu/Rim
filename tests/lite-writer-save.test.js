import test from 'node:test';
import assert from 'node:assert/strict';
import { LiteWriterWorkspace } from '../src/features/lite-writer.js';

test('queued autosaves reuse the ID created by the first insert', async () => {
  const originalParser = globalThis.DOMParser;
  globalThis.DOMParser = class {
    parseFromString(value) { return { body: { innerHTML: value, childNodes: [] } }; }
  };
  const title = { value: 'Черновик' };
  const editor = { innerHTML: '<p>Первая версия</p>', innerText: 'Первая версия' };
  const root = { isConnected: true, querySelector: selector => selector === '#rimWriterTitle' ? title : selector === '#rimWriterEditor' ? editor : null };
  const writer = new LiteWriterWorkspace({ db: {}, getUser: () => ({ id: 'user-1' }) });
  writer.root = root;
  writer.setStatus = () => {};
  writer.renderDocs = () => {};
  writer.writeLocal = () => true;

  let inserts = 0;
  let updates = 0;
  writer.persist = async (doc) => {
    await new Promise(resolve => setTimeout(resolve, 5));
    if (doc.id) updates++; else inserts++;
    return { ...doc, id: doc.id || 'server-document-id' };
  };

  const first = writer.save();
  editor.innerHTML = '<p>Вторая версия</p>';
  const second = writer.save();
  await Promise.all([first, second]);

  assert.equal(inserts, 1);
  assert.equal(updates, 1);
  assert.equal(writer.activeId, 'server-document-id');
  assert.equal(writer.docs.length, 1);
  assert.equal(writer.docs[0].content, '<p>Вторая версия</p>');
  if (originalParser === undefined) delete globalThis.DOMParser;
  else globalThis.DOMParser = originalParser;
});
