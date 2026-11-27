/**
 * Composition root fragment: settings surface.
 * Binds appearance preferences, settings shell, block list entrypoints,
 * and privacy save hook. Ownership flags prevent legacy dual-binds from
 * reassigning the same window routes after modular bootstrap.
 */
import { AppearancePreferencesService } from '../application/appearance-preferences-service.js';
import { SettingsShellController } from '../application/settings-shell-controller.js';
import { BlockListService } from '../application/block-list-service.js';
import { PrivacySettingsService } from '../application/privacy-settings-service.js';
import { ProfileController } from '../application/profile-controller.js';
import { RecoveryCodesService } from '../application/recovery-codes-service.js';
import { DeviceLockService } from '../application/device-lock-service.js';

/**
 * @param {object} deps
 */
export function bindSettingsSurface({
  client,
  getUser,
  notify,
  logger,
  container,
  lifecycle,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  isImperator = () => false,
  getProfile = () => null,
  setProfile = () => {}
} = {}) {
  const win = windowRef;
  const doc = documentRef;

  const privacySettings = new PrivacySettingsService({
    client,
    getUser,
    getTheme: () => win.currentTheme || (typeof localStorage !== 'undefined' ? localStorage.getItem('rim_theme') : null) || 'dark',
    getLanguage: () => win.currentLanguage || (typeof localStorage !== 'undefined' ? localStorage.getItem('rim_language') : null) || 'ru',
    notify,
    logger
  });
  container?.value?.('privacySettings', privacySettings);
  win.__RIM_PRIVACY_SETTINGS_OWNED = true;

  const appearancePreferences = new AppearancePreferencesService({
    client,
    getUser,
    notify,
    logger
  });
  container?.value?.('appearance', appearancePreferences);
  win.__RIM_APPEARANCE_OWNED = true;
  win.applyTheme = () => appearancePreferences.applyTheme();
  win.applyLanguage = () => appearancePreferences.applyLanguage();
  win.changeTheme = value => appearancePreferences.changeTheme(value);
  win.changeLanguage = value => appearancePreferences.changeLanguage(value);
  win.saveSettings = () => appearancePreferences.saveSettings();
  win.loadSettings = async () => appearancePreferences.loadFromServer();
  try { appearancePreferences.bootstrap(); } catch { /* ignore */ }
  lifecycle?.add?.(() => { win.__RIM_APPEARANCE_OWNED = false; });

  const recoveryCodes = new RecoveryCodesService({ client });
  const deviceLock = new DeviceLockService({ client, documentRef: doc, windowRef: win, notify });
  deviceLock.start();
  win.rimOpenDeviceLockSettings = () => deviceLock.openSettings();
  container?.value?.('deviceLock', deviceLock);
  lifecycle?.add?.(() => deviceLock.dispose());
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  let pendingRecoveryPhrase = '';
  let pendingRecoveryChecks = [];
  win.rimGenerateRecoveryPhrase = async (wordCount = 24) => {
    try {
      const count = Number(wordCount) === 12 ? 12 : 24;
      pendingRecoveryPhrase = await recoveryCodes.createPhraseDraft(count);
      const words = pendingRecoveryPhrase.split(' ');
      const picks = new Set();
      while (picks.size < 3) picks.add(crypto.getRandomValues(new Uint32Array(1))[0] % words.length);
      pendingRecoveryChecks = [...picks].sort((a, b) => a - b);
      const safePhrase = escapeHtml(pendingRecoveryPhrase);
      const checks = pendingRecoveryChecks.map((index, i) => `<label class="field-label">Слово №${index + 1}<input class="field" id="rimRecoveryCheck${i}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Введите слово №${index + 1}"></label>`).join('');
      const strength = count === 24 ? 'Повышенная стойкость · 184 бита энтропии' : 'Обычный вариант · 128 бит энтропии';
      win.showModal?.(`<h2 class="modal-title">Секретная фраза RIM · ${count} слов</h2><div class="rim-recovery-explainer"><b>${strength}.</b><p>Фраза нужна, если вы потеряете доступ к Google, Telegram или обычному способу входа. Введите её в форме восстановления RIM — после успешного применения старая фраза становится недействительной.</p><p><b>Хранение:</b> лучше записать слова на бумаге и держать копию в защищённом месте. Допустим надёжный менеджер паролей. Не отправляйте фразу в чаты, письма и формы поддержки; не храните её в открытых заметках или скриншотах.</p><p><b>Важно:</b> любой, кто получит все ${count} слова, сможет восстановить ваш аккаунт. RIM не сможет показать забытую фразу повторно. Создание новой фразы аннулирует предыдущую. Фраза не шифрует переписку и не скрывает сетевые метаданные.</p></div><div class="rim-recovery-phrase" id="rimRecoveryPhraseDisplay">${safePhrase}</div><button class="primary-btn" style="width:100%;margin-top:10px" onclick="rimCopyRecoveryPhrase()">Копировать фразу</button><div class="rim-recovery-confirm"><b>Проверьте, что сохранили фразу</b><p>Введите три слова, которые RIM случайно выбрал из вашей фразы. Это проверка записи, а не дополнительный секрет.</p>${checks}<button class="primary-btn" style="width:100%;margin-top:8px" onclick="rimConfirmRecoveryPhrase()">Подтвердить и активировать</button></div><button class="action-btn" style="width:100%;margin-top:8px" onclick="rimCancelRecoveryPhrase()">Отмена</button>`);
      return true;
    } catch (error) { pendingRecoveryPhrase = ''; pendingRecoveryChecks = []; notify?.(error?.message || 'Не удалось создать секретную фразу.'); return false; }
  };
  win.rimConfirmRecoveryPhrase = async () => {
    if (!pendingRecoveryPhrase || pendingRecoveryChecks.length !== 3) return notify?.('Сначала создайте фразу заново.');
    const words = pendingRecoveryPhrase.split(' ');
    const correct = pendingRecoveryChecks.every((index, i) => (doc.getElementById(`rimRecoveryCheck${i}`)?.value || '').trim().toLowerCase() === words[index]);
    if (!correct) return notify?.('Проверка не пройдена. Сверьте три выбранных слова с записью.');
    try {
      await recoveryCodes.savePhrase(pendingRecoveryPhrase);
      pendingRecoveryPhrase = ''; pendingRecoveryChecks = [];
      win.closeModal?.();
      notify?.('Фраза активирована. Сохраните её отдельно: RIM больше не покажет её.');
    } catch (error) { notify?.(error?.message || 'Не удалось активировать фразу.'); }
  };
  win.rimCancelRecoveryPhrase = () => { pendingRecoveryPhrase = ''; pendingRecoveryChecks = []; win.closeModal?.(); };
  win.rimCopyRecoveryPhrase = async () => {
    const phrase = doc.getElementById('rimRecoveryPhraseDisplay')?.textContent || '';
    try { await win.navigator?.clipboard?.writeText?.(phrase); notify?.('Фраза скопирована. Убедитесь, что сохранили её в безопасном месте.'); }
    catch { notify?.('Автоматическое копирование недоступно. Выделите фразу и скопируйте вручную.'); }
  };
  win.rimMaybeShowSecurityOnboarding = async () => {
    try {
      const status = await recoveryCodes.securityStatus();
      if (!status?.onboarding_required) return false;
      await recoveryCodes.markOnboardingSeen();
      const passwordBlock = status.has_password ? '' : `<div class="rim-security-onboarding-option"><b>А. Создать облачный пароль</b><p>Позволит входить в RIM по почте и паролю, независимо от Telegram или Google.</p><input class="field" id="rimCloudPassword" type="password" autocomplete="new-password" placeholder="Новый пароль · минимум 12 символов"><input class="field" id="rimCloudPasswordConfirm" type="password" autocomplete="new-password" placeholder="Повторите пароль"><button class="action-btn" style="width:100%;margin-top:7px" onclick="rimSetCloudPassword()">Создать пароль</button></div>`;
      win.showModal?.(`<h2 class="modal-title">Защитите аккаунт RIM</h2><p class="muted">Настройте независимый способ восстановления доступа. Это предложение показывается один раз; позже фразу можно создать в Настройки → Конфиденциальность → Безопасность аккаунта.</p>${passwordBlock}<div class="rim-security-onboarding-option"><b>Б. Создать секретную фразу RIM</b><p>Выберите формат: 24 слова — повышенная стойкость (184 бита); 12 слов — обычный вариант (128 бит). Оба формата независимы от Google и Telegram, слова не хранятся в открытом виде.</p><button class="primary-btn" style="width:100%" onclick="rimGenerateRecoveryPhrase(24)">Максимальная стойкость · 24 слова</button><button class="action-btn" style="width:100%;margin-top:7px" onclick="rimGenerateRecoveryPhrase(12)">Обычная · 12 слов</button></div><button class="action-btn" style="width:100%;margin-top:8px" onclick="closeModal()">Сделаю позже — создам в настройках</button>`);
      return true;
    } catch (error) { logger?.warn?.('security.onboarding.failed', { message: error?.message || String(error) }); return false; }
  };
  win.rimSetCloudPassword = async () => {
    const password = doc.getElementById('rimCloudPassword')?.value || '';
    const confirmation = doc.getElementById('rimCloudPasswordConfirm')?.value || '';
    if (password.length < 12) return notify?.('Пароль должен содержать не менее 12 символов.');
    if (password !== confirmation) return notify?.('Пароли не совпадают.');
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      notify?.('Облачный пароль создан. Теперь можно входить независимо от внешнего провайдера.');
      const button = doc.querySelector('#modalRoot .modal button[onclick="rimSetCloudPassword()"]');
      if (button) { button.textContent = 'Пароль создан'; button.disabled = true; }
    } catch (error) { notify?.(error?.message || 'Не удалось создать облачный пароль.'); }
  };
  win.rimOpenSeedOnlySettings = async () => {
    try {
      const status = await recoveryCodes.securityStatus();
      if (!status?.seed_only_ready) {
        win.showModal?.(`<h2 class="modal-title">Строгий вход по seed-фразе</h2><div class="rim-recovery-explainer"><b>Серверная защита подготовлена, но Auth Hook ещё не активирован.</b><p>Пока Custom Access Token Hook не выбран в настройках Supabase Auth, включать режим нельзя: иначе можно заблокировать обычные способы входа, не обеспечив корректную выдачу seed-сессий.</p><p>После подключения функции <code>public.custom_access_token_hook</code> нужно подтвердить готовность сервера. До этого переключатель намеренно закрыт.</p><p>Auth Hook проверяет способ выдачи каждой новой JWT-сессии; вход по email/паролю, OAuth, magic link и OTP будет запрещён. Разрешён будет только пароль, вычисленный из seed-фразы.</p></div><button class="primary-btn" style="width:100%" onclick="closeModal()">Понятно</button>`);
        return false;
      }
      if (status.seed_only_enabled) {
        win.showModal?.(`<h2 class="modal-title">Строгий режим включён</h2><div class="rim-recovery-explainer"><b>Вход разрешён только через вашу seed-фразу.</b><p>Старый пароль заменён производным секретом, который RIM вычисляет из фразы. Внешние OAuth, magic link и обычный OTP должны отклоняться Auth Hook. Остальные устройства отозваны.</p><p>Для отключения режима подтвердите seed-фразу и задайте новый облачный пароль.</p></div><label class="field-label">Ваша seed-фраза</label><textarea class="field" id="rimSeedOnlyDisablePhrase" rows="3" autocomplete="off" autocapitalize="none" spellcheck="false"></textarea><label class="field-label">Новый пароль (не менее 12 символов)</label><input class="field" id="rimSeedOnlyNewPassword" type="password" autocomplete="new-password"/><button class="primary-btn" style="width:100%;margin-top:8px" onclick="rimDisableSeedOnly()">Отключить строгий режим</button>`);
        return true;
      }
      if (!status.has_recovery_phrase) {
        win.showModal?.(`<h2 class="modal-title">Сначала создайте seed-фразу</h2><p class="muted">Для строгого входа нужна активная фраза восстановления. Доступны 24 слова (184 бита) и 12 слов (128 бит). Создайте и проверьте её, затем вернитесь сюда.</p><button class="primary-btn" style="width:100%" onclick="closeModal();rimGenerateRecoveryPhrase(24)">Максимальная стойкость · 24 слова</button><button class="action-btn" style="width:100%;margin-top:7px" onclick="closeModal();rimGenerateRecoveryPhrase(12)">Обычная · 12 слов</button>`);
        return false;
      }
      win.showModal?.(`<h2 class="modal-title">Включить вход только по seed-фразе</h2><div class="rim-recovery-explainer"><b>Это серьёзное изменение способа входа.</b><ul><li>RIM заменит текущий облачный пароль на секрет, производный от seed-фразы.</li><li>Вход через email+старый пароль, OAuth и magic link будет блокироваться серверным Auth Hook.</li><li>Другие активные сессии будут отозваны. После смены пароля текущая сессия тоже может потребовать повторного входа.</li><li>После выхода для входа понадобится вся seed-фраза — 12 или 24 слова, в зависимости от выбранного формата.</li></ul><p><b>Потеря фразы означает потерю доступа.</b> Убедитесь, что сохранили её офлайн и проверили запись.</p></div><label class="field-label">Подтвердите свою seed-фразу</label><textarea class="field" id="rimSeedOnlyEnablePhrase" rows="3" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="12 или 24 слова через пробел"></textarea><button class="primary-btn" style="width:100%;margin-top:8px" onclick="rimEnableSeedOnly()">Включить строгий режим</button>`);
      return true;
    } catch (error) { notify?.(error?.message || 'Не удалось загрузить настройки seed-only.'); return false; }
  };
  win.rimEnableSeedOnly = async () => {
    const phrase = doc.getElementById('rimSeedOnlyEnablePhrase')?.value || '';
    try {
      await recoveryCodes.enableSeedOnly(phrase);
      win.closeModal?.();
      notify?.('Строгий вход по seed-фразе включён. Сохраните фразу офлайн.');
    } catch (error) { notify?.(error?.message || 'Не удалось включить строгий режим.'); }
  };
  win.rimDisableSeedOnly = async () => {
    const phrase = doc.getElementById('rimSeedOnlyDisablePhrase')?.value || '';
    const password = doc.getElementById('rimSeedOnlyNewPassword')?.value || '';
    try {
      await recoveryCodes.disableSeedOnly(phrase, password);
      win.closeModal?.();
      notify?.('Строгий режим отключён. Новый пароль установлен.');
    } catch (error) { notify?.(error?.message || 'Не удалось отключить строгий режим.'); }
  };

  win.rimGenerateRecoveryCodes = async () => {
    try {
      const codes = await recoveryCodes.issue();
      const safeCodes = codes.map(code => String(code).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])).join('\n');
      win.showModal?.(`<h2 class="modal-title">Коды восстановления RIM</h2><p class="muted">Сохраните эти 10 кодов в надёжном месте. Они показываются только сейчас. Выпуск нового набора аннулирует предыдущий.</p><pre style="white-space:pre-wrap;user-select:text;overflow-wrap:anywhere;padding:12px;background:var(--panel2);border-radius:10px">${safeCodes}</pre><button class="primary-btn" style="width:100%" onclick="closeModal()">Я сохранил коды</button>`);
    } catch (error) {
      notify?.(error?.message || 'Не удалось создать коды восстановления.');
    }
  };

  const settingsShell = new SettingsShellController({
    getTheme: () => appearancePreferences.getTheme(),
    getLanguage: () => appearancePreferences.getLanguage(),
    getPrivacy: () => {
      try {
        if (win.privacySettings?.readLocal) return win.privacySettings.readLocal();
      } catch { /* ignore */ }
      try {
        return container?.get?.('privacySettings')?.readLocal?.() || { showOnline: true, allowForward: true, showRead: true };
      } catch {
        return { showOnline: true, allowForward: true, showRead: true };
      }
    },
    logger
  });
  container?.value?.('settingsShell', settingsShell);
  win.__RIM_SETTINGS_SHELL_OWNED = true;
  win.openSettings = () => settingsShell.open();
  lifecycle?.add?.(() => { win.__RIM_SETTINGS_SHELL_OWNED = false; });

  const blockList = new BlockListService({
    client,
    getUser,
    notify,
    logger
  });
  container?.value?.('blockList', blockList);
  win.__RIM_BLOCK_LIST_OWNED = true;
  win.rimOpenBlocks = () => blockList.open();
  win.rimAddBlock = () => blockList.promptAdd();
  win.rimRemoveBlock = id => blockList.remove(id);
  lifecycle?.add?.(() => { win.__RIM_BLOCK_LIST_OWNED = false; });

  const profileController = new ProfileController({
    client,
    getUser,
    getProfile,
    setProfile,
    isImperator,
    notify,
    logger
  });
  container?.value?.('profile', profileController);
  win.__RIM_PROFILE_OWNED = true;
  win.openProfile = () => profileController.open();
  win.loadProfile = async () => {
    const result = await profileController.ensureProfile();
    if (!result.ok) {
      logger?.warn?.('profile.load.failed', { message: result.error?.message });
    } else {
      try { win.dispatchEvent?.(new win.Event('rim:profile-updated')); } catch { /* optional avatar refresh */ }
    }
    return result;
  };
  win.saveProfile = async () => {
    const result = await profileController.saveFromDom();
    if (!result.ok) notify?.(result.error?.message || 'Ошибка сохранения профиля');
    else {
      try { win.dispatchEvent?.(new win.Event('rim:profile-updated')); } catch { /* optional avatar refresh */ }
    }
    return result;
  };
  win.saveProfileEnhanced = win.saveProfile;
  lifecycle?.add?.(() => { win.__RIM_PROFILE_OWNED = false; });

  win.rimSavePrivacy = async () => privacySettings.saveFromDom({
    showOnline: !!doc.getElementById('rimOnline')?.checked,
    allowForward: !!doc.getElementById('rimForward')?.checked,
    showRead: !!doc.getElementById('rimRead')?.checked
  });
  lifecycle?.add?.(() => { win.__RIM_PRIVACY_SETTINGS_OWNED = false; });

  // Keep a readable alias used by settings shell privacy fallback.
  win.privacySettings = privacySettings;

  logger?.info?.('composition.settingsSurface.bound', {});
  return {
    appearancePreferences,
    settingsShell,
    blockList,
    privacySettings,
    profileController,
    recoveryCodes,
    deviceLock
  };
}
