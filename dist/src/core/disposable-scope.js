/**
 * Small deterministic lifecycle owner for listeners, observers and async UI work.
 * Disposers run in reverse registration order and are idempotent.
 */
export class DisposableScope {
  constructor({ onError = () => {} } = {}) {
    this.onError = onError;
    this.disposers = [];
    this.disposed = false;
  }

  add(disposer) {
    if (typeof disposer !== 'function') throw new TypeError('Disposer must be a function');
    if (this.disposed) {
      this.#run(disposer);
      return () => {};
    }
    let active = true;
    const wrapped = () => {
      if (!active) return;
      active = false;
      this.#run(disposer);
    };
    this.disposers.push(wrapped);
    return wrapped;
  }

  listen(target, type, listener, options) {
    if (!target?.addEventListener) throw new TypeError('Event target is invalid');
    target.addEventListener(type, listener, options);
    return this.add(() => target.removeEventListener(type, listener, options));
  }

  observe(observer, target, options) {
    if (!observer?.observe || !target) throw new TypeError('Observer or target is invalid');
    observer.observe(target, options);
    return this.add(() => observer.disconnect());
  }

  timeout(callback, delay) {
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      if (!this.disposed) callback();
    }, delay);
    this.timeouts.add(id);
    return this.add(() => { clearTimeout(id); this.timeouts.delete(id); });
  }

  #run(disposer) {
    try {
      const result = disposer();
      if (result && typeof result.then === 'function') result.catch(this.onError);
    } catch (error) { this.onError(error); }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const disposer of this.disposers.splice(0).reverse()) disposer();
    for (const id of this.timeouts) clearTimeout(id);
    this.timeouts.clear();
  }

  timeouts = new Set();
  get size() { return this.disposers.length; }
}
