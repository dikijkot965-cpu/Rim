/**
 * Pure connection / transport status labels for the client shell.
 */

export const CONNECTION = Object.freeze({
  ONLINE: 'online',
  OFFLINE: 'offline',
  RECONNECTING: 'reconnecting',
  UNKNOWN: 'unknown'
});

/**
 * @param {{ online?: boolean, reconnecting?: boolean }} snap
 * @returns {{ status: string, label: string, severity: 'ok'|'warn'|'bad' }}
 */
export function resolveConnectionStatus(snap = {}) {
  if (snap.reconnecting) {
    return { status: CONNECTION.RECONNECTING, label: 'Восстановление связи…', severity: 'warn' };
  }
  if (snap.online === false) {
    return { status: CONNECTION.OFFLINE, label: 'Нет сети', severity: 'bad' };
  }
  if (snap.online === true) {
    return { status: CONNECTION.ONLINE, label: 'На связи', severity: 'ok' };
  }
  return { status: CONNECTION.UNKNOWN, label: 'Статус связи неизвестен', severity: 'warn' };
}
