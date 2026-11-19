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
    }
    return result;
  };
  win.saveProfile = async () => {
    const result = await profileController.saveFromDom();
    if (!result.ok) notify?.(result.error?.message || 'Ошибка сохранения профиля');
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
    recoveryCodes
  };
}
