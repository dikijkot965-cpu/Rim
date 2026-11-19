/**
 * Signed avatar URL cache + sequence-safe DOM paint for peer/header avatars.
 */
export class PeerAvatarService {
  constructor({
    storage,
    logger = null,
    signedTtlMs = 25 * 60 * 1000,
    signTtlSec = 1800
  } = {}) {
    this.storage = storage;
    this.logger = logger;
    this.signedTtlMs = signedTtlMs;
    this.signTtlSec = signTtlSec;
    this.cache = new Map();
    this.headerSequence = 0;
  }

  setHeaderSequence(sequence) {
    this.headerSequence = sequence;
  }

  getHeaderSequence() {
    return this.headerSequence;
  }

  async urlFor(peer) {
    if (peer?.avatar_url) {
      try {
        const url = new URL(peer.avatar_url, globalThis.location?.href || 'https://local.invalid');
        if (url.protocol === 'https:' || url.origin === globalThis.location?.origin) return url.href;
      } catch { /* fall through to Storage path */ }
    }
    if (!peer?.avatar_path) return null;
    const key = String(peer.avatar_path);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    if (cached?.promise) return cached.promise;

    const promise = (async () => {
      const { data, error } = await this.storage.from('avatars').createSignedUrl(key, this.signTtlSec);
      if (error) throw error;
      const url = data?.signedUrl || null;
      if (url) this.cache.set(key, { url, expiresAt: Date.now() + this.signedTtlMs });
      else this.cache.delete(key);
      return url;
    })();
    this.cache.set(key, { promise, expiresAt: Date.now() + 30_000 });
    try {
      return await promise;
    } catch (error) {
      this.cache.delete(key);
      this.logger?.warn?.('chat.avatar.sign.failed', { message: error?.message });
      return null;
    }
  }

  async apply(node, peer, fallback = 'П', sequence = this.headerSequence) {
    if (!node) return;
    const requestId = (Number(node.dataset.rimAvatarRequest) || 0) + 1;
    node.dataset.rimAvatarRequest = String(requestId);
    const src = await this.urlFor(peer);
    if (!node.isConnected || sequence !== this.headerSequence || node.dataset.rimAvatarRequest !== String(requestId)) {
      return;
    }
    node.replaceChildren();
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
      node.append(img);
    } else {
      node.textContent = (fallback || 'П').trim().slice(0, 1).toUpperCase();
    }
  }

  dispose() {
    this.cache.clear();
  }
}
