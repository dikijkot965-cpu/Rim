import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerAvatarService } from '../src/application/peer-avatar-service.js';

test('urlFor returns https avatar_url as-is', async () => {
  const service = new PeerAvatarService({ storage: { from() { return {}; } } });
  const url = await service.urlFor({ avatar_url: 'https://cdn.example/a.png' });
  assert.equal(url, 'https://cdn.example/a.png');
});

test('apply paints initial when no avatar', async () => {
  const service = new PeerAvatarService({ storage: { from() { return {}; } } });
  const node = {
    isConnected: true,
    dataset: {},
    replaceChildren() { this.children = []; },
    textContent: ''
  };
  await service.apply(node, {}, 'ад', 0);
  assert.equal(node.textContent, 'А');
});

test('stale sequence skips paint', async () => {
  const service = new PeerAvatarService({
    storage: {
      from() {
        return {
          createSignedUrl: async () => ({ data: { signedUrl: 'https://x/a.png' }, error: null })
        };
      }
    }
  });
  service.setHeaderSequence(1);
  const node = {
    isConnected: true,
    dataset: {},
    replaceChildren() { this.replaced = true; },
    append() { this.appended = true; }
  };
  await service.apply(node, { avatar_path: 'p/a.png' }, 'П', 0);
  assert.equal(node.replaced, undefined);
  assert.equal(node.appended, undefined);
});
