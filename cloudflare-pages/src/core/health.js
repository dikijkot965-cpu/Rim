const now = () => globalThis.performance?.now?.() ?? Date.now();

export class HealthRegistry {
  #checks = new Map();
  constructor({ timeoutMs = 8000 } = {}) { this.timeoutMs = Math.max(100, Number(timeoutMs) || 8000); }
  register(name, check, { timeoutMs = this.timeoutMs } = {}) {
    if (!name || typeof check !== 'function') throw new TypeError('Health check requires a name and function');
    this.#checks.set(name, { check, timeoutMs: Math.max(100, Number(timeoutMs) || this.timeoutMs) });
    return () => this.#checks.delete(name);
  }
  async run() {
    const checks = await Promise.all([...this.#checks].map(async ([name, item]) => {
      const started = now();
      let timer;
      try {
        await Promise.race([
          Promise.resolve().then(item.check),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Health check timed out after ${item.timeoutMs}ms`)), item.timeoutMs); })
        ]);
        return { name, status: 'ok', durationMs: Math.round(now() - started) };
      } catch (error) {
        return { name, status: 'error', durationMs: Math.round(now() - started), message: error?.message || 'failed' };
      } finally { clearTimeout(timer); }
    }));
    return { status: checks.every(x => x.status === 'ok') ? 'ok' : 'degraded', checks, at: new Date().toISOString() };
  }
}
