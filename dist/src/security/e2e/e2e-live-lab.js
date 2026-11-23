/**
 * Temporary, opt-in live E2E test surface.
 * Available only with ?rim-e2e-lab=1; never exposes tokens or private keys.
 * Device enrollment and sending are explicit user actions, not startup behavior.
 */
export function bindE2ELiveLab({ client, getUser, getActiveConversation = () => null, runtime, documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
  if (!windowRef?.location?.search || !new URLSearchParams(windowRef.location.search).has('rim-e2e-lab')) return () => {};
  if (!client?.auth?.getSession || !client?.functions?.invoke || !runtime || !documentRef?.body) return () => {};
  if (documentRef.getElementById('rim-e2e-live-lab')) return () => {};

  const el = (tag, text, className) => {
    const node = documentRef.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  };
  const panel = el('section', null, 'rim-e2e-lab');
  panel.id = 'rim-e2e-live-lab';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'RIM E2E live test');
  const style = el('style');
  style.textContent = `
    .rim-e2e-lab{position:fixed;z-index:2147483000;inset:12px 12px auto auto;width:min(440px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;background:#101722;color:#edf3fa;border:1px solid #52647a;border-radius:14px;padding:16px;box-shadow:0 16px 55px #0009;font:14px/1.45 system-ui,sans-serif}
    .rim-e2e-lab h2{font-size:18px;margin:0 0 6px}.rim-e2e-lab p{margin:6px 0;color:#b9c7d8}.rim-e2e-lab label{display:block;margin:10px 0 4px;color:#cbd7e5}.rim-e2e-lab input{box-sizing:border-box;width:100%;padding:10px;border-radius:8px;border:1px solid #52647a;background:#172333;color:#fff}.rim-e2e-lab button{border:1px solid #61748b;border-radius:8px;background:#24364c;color:#fff;padding:9px 11px;margin:8px 6px 0 0;font-weight:600}.rim-e2e-lab button:disabled{opacity:.5}.rim-e2e-lab .danger{border-color:#9c684a}.rim-e2e-lab pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0a1019;border-radius:8px;padding:10px;max-height:190px;overflow:auto;color:#dce8f5}.rim-e2e-lab .muted{font-size:12px;color:#9eb0c5}
  `;
  const title = el('h2', 'RIM · E2E Live Lab');
  const intro = el('p', 'Экспериментальная проверка реального Signal SDK и Supabase Relay в уже активированных E2E-областях. Лаборатория не включает E2E и не меняет режим переписки.');
  const status = el('p', 'Состояние: проверка сессии…');
  const account = el('p', 'Аккаунт: —');
  const warning = el('p', 'Регистрация устройства создаст локальную криптографическую идентичность и опубликует публичные prekeys. Приватные ключи остаются на этом устройстве. Не очищайте данные браузера после регистрации.', 'muted');
  const scopeLabel = el('label', 'Тип защищённой переписки');
  const scopeType = el('select');
  for (const [value, label] of [['direct', 'Секретный личный чат'], ['group', 'Секретная приватная группа'], ['private_channel', 'Закрытый E2E-канал']]) { const option = el('option', label); option.value = value; scopeType.append(option); }
  const recipientLabel = el('label', 'UUID второго аккаунта (только для ЛС)');
  const recipient = el('input'); recipient.placeholder = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'; recipient.autocomplete = 'off';
  const conversationLabel = el('label', 'UUID существующей E2E-переписки');
  const conversation = el('input'); conversation.placeholder = 'ID из таблицы conversations'; conversation.autocomplete = 'off';
  const output = el('pre', 'Журнал проверки появится здесь.');
  const start = el('button', 'Запустить SDK и подключить Relay');
  const refresh = el('button', 'Проверить устройства');
  const send = el('button', 'Отправить E2E-тест');
  const stop = el('button', 'Остановить локальную сессию', 'danger');
  const close = el('button', 'Закрыть');
  panel.append(style, title, intro, status, account, warning, scopeLabel, scopeType, recipientLabel, recipient, conversationLabel, conversation, start, refresh, send, stop, close, output);
  documentRef.body.append(panel);

  let busy = false;
  let currentUserId = '';
  const log = message => {
    const stamp = new Date().toLocaleTimeString();
    output.textContent = `${stamp}  ${String(message)}\n${output.textContent}`.slice(0, 12000);
  };
  const setBusy = value => {
    busy = value;
    for (const button of [start, refresh, send, stop]) button.disabled = value;
  };
  const getAuthenticatedUser = async () => {
    const [{ data, error }, appUser] = await Promise.all([client.auth.getSession(), Promise.resolve(getUser?.())]);
    if (error) throw error;
    const sessionUserId = String(data?.session?.user?.id || '');
    const appUserId = String(appUser?.id || '');
    if (!sessionUserId || !appUserId || sessionUserId !== appUserId) throw new Error('Нет согласованной активной сессии RIM. Войдите в аккаунт и обновите страницу.');
    currentUserId = sessionUserId;
    account.textContent = `Аккаунт: ${currentUserId}`;
    return currentUserId;
  };
  const invoke = async (action, payload = {}) => {
    const { data, error } = await client.functions.invoke('rim-e2e-relay', { body: { action, ...payload } });
    if (error) {
      let message = error.message || `Relay action failed: ${action}`;
      try { const parsed = await error.context?.json?.(); if (parsed?.error) message = parsed.error; } catch { /* keep SDK error */ }
      throw new Error(message);
    }
    if (data?.error) throw new Error(String(data.error));
    return data?.result;
  };
  const checkDevices = async () => {
    const userId = await getAuthenticatedUser();
    const devices = await invoke('get_devices', { userId });
    log(`Relay: найдено активных зарегистрированных устройств: ${Array.isArray(devices) ? devices.length : 0}.`);
    for (const device of devices || []) log(`Устройство №${device.deviceId}: ${device.deviceType || 'unknown'}, registered=${device.registered}, enabled=${device.enabled}.`);
    return devices || [];
  };

  refresh.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try { await checkDevices(); status.textContent = 'Состояние: авторизованный Relay доступен.'; }
    catch (error) { status.textContent = `Ошибка: ${error.message}`; log(`ОШИБКА: ${error.message}`); }
    finally { setBusy(false); }
  });

  start.addEventListener('click', async () => {
    if (busy) return;
    const accepted = windowRef.confirm('Продолжить? SDK подключится к Relay. Если у аккаунта ещё нет E2E-устройства, будет зарегистрировано основное устройство №1 и созданы ключи. Если устройство уже существует, но локальных ключей нет, операция должна остановиться без перезаписи.');
    if (!accepted) return;
    setBusy(true);
    try {
      await getAuthenticatedUser();
      const result = await runtime.startIncoming();
      const devices = await runtime.relay?.getDevices?.(currentUserId) || [];
      const inventory = await runtime.relay?.getPreKeyInventory?.(currentUserId, 1) || null;
      status.textContent = `Состояние: ${result.state}; protocolReady=${result.protocolReady}.`;
      log(`SDK запущен. Состояние=${result.state}; protocolReady=${result.protocolReady}.`);
      log(`Зарегистрированных устройств: ${devices.length}.`);
      if (inventory) log(`Prekeys: EC=${inventory.ecOneTimePreKeyCount}, KEM=${inventory.kemOneTimePreKeyCount}; signed=${Boolean(inventory.ecSignedPreKey)}, last-resort=${Boolean(inventory.kemLastResortPreKey)}.`);
      log('Важно: запуск SDK не означает активацию E2E-режима чата.');
    } catch (error) { status.textContent = `Ошибка запуска: ${error.message}`; log(`ОШИБКА запуска: ${error.message}`); }
    finally { setBusy(false); }
  });

  send.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try {
      const senderId = await getAuthenticatedUser();
      const targetId = recipient.value.trim();
      const conversationId = conversation.value.trim();
      const selectedScope = String(scopeType.value || 'direct');
      if (!['direct', 'group', 'private_channel'].includes(selectedScope)) throw new Error('Выбран неподдерживаемый тип E2E-области.');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) throw new Error('Укажи корректный UUID E2E-переписки.');
      if (selectedScope === 'direct' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) throw new Error('Для личного теста укажи UUID второго аккаунта.');
      if (!runtime.client || runtime.userId !== senderId || !['relay-connected-unverified', 'relay-verified'].includes(runtime.state)) throw new Error('Сначала запусти SDK и подключи Relay на этом аккаунте. Второй участник также должен быть подключён.');

      const table = selectedScope === 'private_channel' ? 'channels' : 'conversations';
      const fields = selectedScope === 'private_channel' ? 'id,is_public,e2e_mode' : 'id,type,is_private,is_secret,e2e_mode';
      const { data: scope, error: scopeError } = await client.from(table).select(fields).eq('id', conversationId).maybeSingle();
      if (scopeError) throw scopeError;
      if (!scope) throw new Error('Защищённая переписка не найдена или недоступна.');
      if (selectedScope === 'direct' && (scope.type !== 'direct' || scope.is_secret !== true || scope.e2e_mode !== 'required')) throw new Error('Нужен уже активированный секретный личный чат с e2e_mode=required.');
      if (selectedScope === 'group' && (scope.type !== 'group' || scope.is_private !== true || scope.e2e_mode !== 'required')) throw new Error('Нужна уже активированная приватная группа с e2e_mode=required.');
      if (selectedScope === 'private_channel' && (scope.is_public !== false || scope.e2e_mode !== 'required')) throw new Error('Нужен уже активированный закрытый канал с e2e_mode=required.');

      const membershipTable = selectedScope === 'private_channel' ? 'channel_members' : 'conversation_members';
      const membershipKey = selectedScope === 'private_channel' ? 'channel_id' : 'conversation_id';
      const { data: members, error: memberError } = await client.from(membershipTable).select('user_id').eq(membershipKey, conversationId);
      if (memberError) throw memberError;
      const memberIds = [...new Set((members || []).map(row => String(row.user_id || '')).filter(Boolean))];
      if (memberIds.length < 2 || !memberIds.includes(senderId)) throw new Error('Не удалось подтвердить полный состав участников. Отправка отменена.');
      if (selectedScope === 'direct' && (memberIds.length !== 2 || !memberIds.includes(targetId))) throw new Error('Личный диалог не содержит ровно эти два аккаунта. Отправка отменена.');

      const testText = `RIM E2E LIVE TEST ${selectedScope} ${new Date().toISOString()} ${windowRef.crypto.randomUUID()}`;
      log(`Проверяю зашифрованный challenge/ACK для ${memberIds.length} участников (${selectedScope}).`);
      const verification = await runtime.verifyScopeExchange({ type: selectedScope, id: conversationId }, memberIds);
      log(`Проверка участников завершена: подтверждено ${verification.verifiedPeerCount}.`);
      const result = selectedScope === 'direct'
        ? await runtime.sendDirect(targetId, testText, { conversationId, clientMessageId: windowRef.crypto.randomUUID() })
        : await runtime.sendGroup(memberIds, testText, { conversationId, scopeType: selectedScope, clientMessageId: windowRef.crypto.randomUUID() });
      if (!result?.messageId) throw new Error('Relay не вернул ID принятого сообщения.');
      if (selectedScope === 'direct') {
        log(`Зашифрованный личный тест отправлен. Relay message ID: ${result.messageId}. Локальная запись: ${result.localPersisted ? 'сохранена' : 'не подтверждена'}.`);
      } else {
        log(`Групповая E2E-рассылка: принято ${result.acceptedRecipientCount}, ошибок ${result.failedRecipientCount}. ID: ${result.messageId}.`);
        for (const failure of result.failedRecipients || []) log(`ОШИБКА доставки участнику ${failure.recipient}: ${failure.error}`);
      }
      status.textContent = result.failedRecipientCount ? 'Состояние: частичная E2E-доставка; проверь журнал и не повторяй автоматически.' : 'Состояние: E2E-тест отправлен; ожидается расшифровка на устройствах участников.';
    } catch (error) { status.textContent = `Ошибка теста: ${error.message}`; log(`ОШИБКА теста: ${error.message}`); }
    finally { setBusy(false); }
  });

  stop.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try { await runtime.dispose(); status.textContent = 'Состояние: локальная SDK-сессия остановлена; серверная регистрация устройства сохранена.'; log('SDK остановлен. Устройство и публичные ключи на сервере не отозваны.'); }
    catch (error) { log(`ОШИБКА остановки: ${error.message}`); }
    finally { setBusy(false); }
  });
  let onE2EMessage = () => {};
  close.addEventListener('click', () => { void runtime.dispose(); windowRef.removeEventListener('rim:e2e-message', onE2EMessage); panel.remove(); style.remove(); });

  onE2EMessage = event => {
    const detail = event?.detail || {};
    const message = detail.message || {};
    if (detail.eventName === 'received') {
      log(`ПОЛУЧЕНО И РАСШИФРОВАНО: ${String(message.body || '').slice(0, 500)}`);
      status.textContent = 'Состояние: входящее E2E-сообщение расшифровано SDK.';
    }
  };
  windowRef.addEventListener('rim:e2e-message', onE2EMessage);
  void getAuthenticatedUser().then(async userId => {
    const active = getActiveConversation?.() || windowRef.currentChannel || null;
    const activeId = String(active?.id || active?.conversation_id || '');
    if (activeId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activeId)) {
      conversation.value = activeId;
      if (active?.type === 'group') scopeType.value = 'group';
      if (active?.is_public === false && active?.type !== 'group' && active?.type !== 'direct') scopeType.value = 'private_channel';
      if (active?.type === 'direct') {
        scopeType.value = 'direct';
        const { data: members } = await client.from('conversation_members').select('user_id').eq('conversation_id', activeId);
        const peer = (members || []).map(row => String(row.user_id)).find(id => id !== userId);
        if (peer) recipient.value = peer;
      }
    }
    status.textContent = 'Состояние: сессия подтверждена. Нажми «Проверить устройства» для read-only проверки.';
  }).catch(error => { status.textContent = `Сессия не подтверждена: ${error.message}`; });

  return () => {
    windowRef.removeEventListener('rim:e2e-message', onE2EMessage);
    panel.remove(); style.remove();
  };
}
