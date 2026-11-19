/**
 * Owns the compatibility boundary with classic-script entry points.
 * Wrappers are registered in one place and can be disposed during hot reload/tests.
 */
export class LegacyEntrypointRegistry {
  constructor(target = globalThis.window) {
    if (!target) throw new Error('Legacy entrypoint target is unavailable');
    this.target = target;
    this.entries = new Map();
  }

  wrap(name, factory) {
    if (this.entries.has(name)) return this.entries.get(name).wrapped;
    const original = this.target[name];
    if (typeof original !== 'function') return null;
    const wrapped = factory(original);
    if (typeof wrapped !== 'function') throw new TypeError(`Wrapper for ${name} must be a function`);
    Object.defineProperty(wrapped, '__rimOriginal', { value: original });
    this.target[name] = wrapped;
    this.entries.set(name, { original, wrapped });
    return wrapped;
  }

  dispose() {
    for (const [name, entry] of [...this.entries].reverse()) {
      if (this.target[name] === entry.wrapped) this.target[name] = entry.original;
    }
    this.entries.clear();
  }

  get size() { return this.entries.size; }
}
