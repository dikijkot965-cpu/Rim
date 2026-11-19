const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export class Logger {
  constructor({ app = 'RIM', version = '2.0.0', sink = console } = {}) { this.app = app; this.version = version; this.sink = sink; }
  context(extra = {}) { return { app: this.app, version: this.version, correlationId: extra.correlationId || id(), at: new Date().toISOString(), ...extra }; }
  info(event, data = {}) { this.sink.info?.('[RIM]', event, this.context(data)); }
  warn(event, data = {}) { this.sink.warn?.('[RIM]', event, this.context(data)); }
  error(event, error, data = {}) { this.sink.error?.('[RIM]', event, this.context({ ...data, error: { name: error?.name, message: error?.message, code: error?.code } })); }
}
