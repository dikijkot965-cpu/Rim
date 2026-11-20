import { resolveConnectionStatus } from '../domain/connection.js';

/**
 * Keeps a compact transport status on the chat header (or toast fallback).
 * Does not invent network truth — mirrors browser online/offline + optional flags.
 */
export class ConnectionStatusController {
  constructor({
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    statusElementId = 'chatHeadStatus',
    logger = null
  } = {}) {
    this.document = documentRef;
    this.window = windowRef;
    this.statusElementId = statusElementId;
    this.logger = logger;
    this.reconnecting = false;
    this._onOnline = () => {
      this.reconnecting = false;
      this.refresh();
    };
    this._onOffline = () => {
      this.reconnecting = false;
      this.refresh();
    };
  }

  snapshot() {
    let online = true;
    try {
      if (this.window?.navigator && typeof this.window.navigator.onLine === 'boolean') {
        online = this.window.navigator.onLine;
      }
    } catch {
      online = true;
    }
    return { online, reconnecting: this.reconnecting };
  }

  refresh() {
    const resolved = resolveConnectionStatus(this.snapshot());
    const el = this.document?.getElementById?.(this.statusElementId);
    if (el) {
      el.textContent = resolved.label;
      el.dataset.rimConnection = resolved.status;
      el.dataset.rimConnectionSeverity = resolved.severity;
    }
    return resolved;
  }

  markReconnecting(value = true) {
    this.reconnecting = Boolean(value);
    return this.refresh();
  }

  bind() {
    try {
      this.window?.addEventListener?.('online', this._onOnline);
      this.window?.addEventListener?.('offline', this._onOffline);
    } catch (error) {
      this.logger?.warn?.('connection.bind.failed', error);
    }
    return this.refresh();
  }

  dispose() {
    try {
      this.window?.removeEventListener?.('online', this._onOnline);
      this.window?.removeEventListener?.('offline', this._onOffline);
    } catch { /* ignore */ }
  }
}
