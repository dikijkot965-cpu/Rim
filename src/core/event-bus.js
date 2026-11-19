/** Synchronous event bus. Subscriber failures are isolated from publishers. */
export class EventBus {
  #listeners = new Map();
  #onError;
  constructor({ onError } = {}) { this.#onError = onError || ((error, type) => console.error('[RIM] event subscriber failed', type, error)); }

  on(type, handler, { signal, once = false } = {}) {
    if (typeof handler !== 'function') throw new TypeError('Event handler must be a function');
    if (signal?.aborted) return () => {};
    if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
    const entry = { handler, once };
    const bucket = this.#listeners.get(type);
    bucket.add(entry);
    const off = () => {
      bucket.delete(entry);
      if (!bucket.size) this.#listeners.delete(type);
      signal?.removeEventListener('abort', off);
    };
    signal?.addEventListener('abort', off, { once: true });
    return off;
  }

  once(type, handler, options = {}) { return this.on(type, handler, { ...options, once: true }); }

  emit(type, payload) {
    const bucket = this.#listeners.get(type);
    if (!bucket?.size) return 0;
    let delivered = 0;
    for (const entry of [...bucket]) {
      if (!bucket.has(entry)) continue;
      if (entry.once) bucket.delete(entry);
      try { entry.handler(payload); delivered += 1; }
      catch (error) { try { this.#onError(error, type); } catch { /* Error reporting must not break dispatch. */ } }
    }
    if (!bucket.size) this.#listeners.delete(type);
    return delivered;
  }

  listenerCount(type) { return this.#listeners.get(type)?.size || 0; }
  clear(type) { if (type === undefined) this.#listeners.clear(); else this.#listeners.delete(type); }
  dispose() { this.clear(); }
}
