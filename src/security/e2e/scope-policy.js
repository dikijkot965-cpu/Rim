/**
 * RIM E2E scope policy.
 * This module deliberately separates eligibility from protocol readiness:
 * a private scope may be eligible, but it must not be advertised as encrypted
 * until a reviewed protocol adapter and every participant device are ready.
 */

export const E2E_PROTOCOL_PROFILE = 'OPEN-E2EE-SP1';
export const E2E_SCOPE_TYPES = Object.freeze(['direct', 'group', 'private_channel']);

export function normalizeE2EScope(input = {}) {
  const type = String(input.type || input.scopeType || '').trim().toLowerCase();
  const id = String(input.id || input.scopeId || '').trim();
  if (!id || id.length > 128) throw new Error('Для E2E требуется корректный идентификатор переписки.');

  if (type === 'direct') return Object.freeze({ type, id, eligible: true });
  if (type === 'group') {
    if (input.is_private !== true && input.isPrivate !== true) {
      return Object.freeze({ type, id, eligible: false, reason: 'E2E разрешено только в приватных группах.' });
    }
    return Object.freeze({ type, id, eligible: true });
  }
  if (type === 'channel' || type === 'private_channel') {
    if (input.is_public === true || input.isPublic === true) {
      return Object.freeze({ type: 'private_channel', id, eligible: false, reason: 'Публичные каналы не поддерживают E2E.' });
    }
    if (input.is_public !== false && input.isPublic !== false) {
      return Object.freeze({ type: 'private_channel', id, eligible: false, reason: 'Не удалось подтвердить приватность канала.' });
    }
    return Object.freeze({ type: 'private_channel', id, eligible: true });
  }
  return Object.freeze({ type, id, eligible: false, reason: 'Этот тип переписки не поддерживает E2E.' });
}

export function evaluateE2EReadiness({ scope, members = [], devices = [], protocolReady = false } = {}) {
  const normalized = normalizeE2EScope(scope);
  if (!normalized.eligible) return Object.freeze({ ready: false, reason: normalized.reason, scope: normalized });
  const memberIds = [...new Set(members.map(row => String(row?.user_id ?? row?.userId ?? '')).filter(Boolean))];
  if (!memberIds.length) return Object.freeze({ ready: false, reason: 'Список участников пуст.', scope: normalized });
  const activeByUser = new Set(devices.filter(row => row?.status === 'active' && (row?.protocol_profile ?? row?.algorithm_suite) === E2E_PROTOCOL_PROFILE).map(row => String(row.user_id ?? row.userId ?? '')));
  const missing = memberIds.filter(id => !activeByUser.has(id));
  if (missing.length) return Object.freeze({ ready: false, reason: 'Не все участники зарегистрировали совместимые E2E-устройства.', missingUserIds: missing, scope: normalized });
  if (!protocolReady) return Object.freeze({ ready: false, reason: 'Криптографический протокол ещё не подключён к отправке и получению сообщений.', missingUserIds: [], scope: normalized });
  return Object.freeze({ ready: true, reason: null, missingUserIds: [], scope: normalized });
}

export function assertEncryptedMessageEnvelope(message, { scope, protocolReady = false } = {}) {
  const normalized = normalizeE2EScope(scope);
  if (!normalized.eligible) throw new Error(normalized.reason || 'E2E недоступно для этой переписки.');
  if (!protocolReady) throw new Error('Отправка заблокирована: E2E-протокол не готов.');
  if (!message || message.encryption_version !== 1 || !message.encrypted_payload || typeof message.encrypted_payload !== 'object') {
    throw new Error('Отправка заблокирована: отсутствует корректный зашифрованный конверт.');
  }
  if (typeof message.body === 'string' && message.body.length) {
    throw new Error('Отправка заблокирована: в E2E-переписке нельзя передавать открытый текст.');
  }
  return true;
}
