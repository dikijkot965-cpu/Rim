/** Small application container. Providers are lazy singletons by default. */
export class Container {
  #providers = new Map();
  #instances = new Map();
  #resolving = [];
  #disposed = false;

  #assertActive() {
    if (this.#disposed) throw new Error('Dependency container has been disposed');
  }

  value(token, value) {
    this.#assertActive();
    if (this.#providers.has(token)) throw new Error(`Dependency already registered as factory: ${String(token)}`);
    this.#instances.set(token, value);
    return this;
  }

  factory(token, factory) {
    this.#assertActive();
    if (typeof factory !== 'function') throw new TypeError('Dependency factory must be a function');
    if (this.#instances.has(token) || this.#providers.has(token)) throw new Error(`Dependency already registered: ${String(token)}`);
    this.#providers.set(token, factory);
    return this;
  }

  has(token) { return this.#instances.has(token) || this.#providers.has(token); }

  get(token) {
    this.#assertActive();
    if (this.#instances.has(token)) return this.#instances.get(token);
    const provider = this.#providers.get(token);
    if (!provider) throw new Error(`Dependency not registered: ${String(token)}`);
    const cycleAt = this.#resolving.indexOf(token);
    if (cycleAt !== -1) {
      const chain = [...this.#resolving.slice(cycleAt), token].map(String).join(' -> ');
      throw new Error(`Circular dependency detected: ${chain}`);
    }
    this.#resolving.push(token);
    try {
      const instance = provider(this);
      if (instance === undefined) throw new Error(`Dependency factory returned undefined: ${String(token)}`);
      this.#instances.set(token, instance);
      return instance;
    } finally {
      this.#resolving.pop();
    }
  }

  async dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    const instances = [...this.#instances.values()].reverse();
    this.#instances.clear();
    this.#providers.clear();
    const errors = [];
    for (const instance of instances) {
      try {
        if (typeof instance?.dispose === 'function') await instance.dispose();
        else if (typeof instance?.close === 'function') await instance.close();
      } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'One or more dependencies failed to dispose');
  }
}
