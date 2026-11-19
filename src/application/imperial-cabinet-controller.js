/**
 * Imperial cabinet modal shell — tiles delegate to existing feature routes.
 */
export class ImperialCabinetController {
  constructor({
    showModal = null,
    windowRef = globalThis.window,
    notificationCount = () => 0
  } = {}) {
    this.window = windowRef;
    this.showModal = showModal || ((html) => this.window?.showModal?.(html));
    this.notificationCount = notificationCount;
  }

  open() {
    const count = Number(this.notificationCount?.() || 0) || 0;
    const badge = count ? ` <span class="feature-count">${count}</span>` : '';
    this.showModal(`<h2 class="modal-title">⚜ Имперский кабинет</h2>
      <p class="muted">Дополнительные разделы и инструменты мессенджера.</p>
      <div class="feature-grid">
        <button class="feature-tile" type="button" onclick="openBulletinBoard()"><b>📜 Доска объявлений</b><small>Объявления и поиск единомышленников</small></button>
        <button class="feature-tile" type="button" onclick="openNotifications()"><b>🔔 Уведомления${badge}</b><small>События мессенджера</small></button>
        <button class="feature-tile" type="button" onclick="openAchievements()"><b>🏅 Достижения</b><small>Награды пользователя</small></button>
        <button class="feature-tile" type="button" onclick="openMemberCard()"><b>🪪 Удостоверение</b><small>Ваш номер участника</small></button>
        <button class="feature-tile" type="button" onclick="openNotificationSettings()"><b>⚙ Оповещения</b><small>Что присылать</small></button>
        <button class="feature-tile" type="button" onclick="rimOpenBlocks()"><b>🚫 Чёрный список</b><small>Заблокированные пользователи</small></button>
      </div>
      <button class="primary-btn" style="width:100%;margin-top:12px" type="button" onclick="closeModal()">Закрыть</button>`);
  }
}
