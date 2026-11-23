/**
 * Fail-closed policy gate for legacy channel features that persist plaintext.
 * E2E-enabled private channels must never silently fall back to these paths.
 */
export function createChannelPlaintextGate({
  getUser,
  getChannel,
  e2eScopeRepository,
  notify = () => {},
  logger = null
} = {}) {
  return async function canPerformPlaintextChannelOperation(operation, channelOverride = null) {
    const channel = channelOverride || getChannel?.() || null;
    const user = getUser?.();
    const reject = message => { notify?.(message); return false; };
    if (!user?.id) return reject('Для операции требуется вход в РИМ.');
    if (!channel?.id || typeof channel.is_public !== 'boolean') {
      return reject('Не удалось подтвердить тип канала. Операция остановлена.');
    }
    const sameContext = () => {
      const activeChannel = getChannel?.();
      return String(getUser?.()?.id || '') === String(user.id)
        && String(activeChannel?.id || '') === String(channel.id);
    };
    if (channel.is_public === true) {
      return sameContext() || reject('Операция отменена: аккаунт или канал изменился.');
    }
    if (typeof e2eScopeRepository?.getScope !== 'function') {
      return reject('Не удалось проверить режим защиты канала. Операция остановлена.');
    }
    let result;
    try {
      result = await e2eScopeRepository.getScope({ type: 'private_channel', id: channel.id, is_public: false }, user.id);
    } catch (error) {
      logger?.warn?.('channels.plaintext_operation.scope_lookup_failed', {
        operation: String(operation || 'unknown'), channelId: String(channel.id), message: String(error?.message || error)
      });
      return reject('Не удалось проверить режим защиты канала. Операция остановлена.');
    }
    if (!sameContext()) return reject('Операция отменена: аккаунт или канал изменился.');
    if (!result?.ok) {
      logger?.warn?.('channels.plaintext_operation.scope_lookup_failed', {
        operation: String(operation || 'unknown'), channelId: String(channel.id), message: String(result?.error?.message || 'unknown')
      });
      return reject('Не удалось проверить режим защиты канала. Операция остановлена.');
    }
    if (result.value?.enabled) return reject('В этом канале требуется E2E. Операция с открытыми данными недоступна.');
    return true;
  };
}
