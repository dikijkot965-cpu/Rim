/**
 * Calls UI placeholder — no media server yet. Owns the page shell only.
 */
export class CallsPlaceholderController {
  constructor({
    openPage = null,
    windowRef = globalThis.window
  } = {}) {
    this.window = windowRef;
    this.openPage = openPage || ((title, html) => this.window?.fullPage?.(title, html));
  }

  open() {
    this.openPage(
      'Звонки и видеозвонки',
      `<div class="card">
        <h3>Связь нового поколения</h3>
        <p class="muted">Голосовые и видеозвонки уже предусмотрены в интерфейсе РИМа. Подключение медиасервера, сигнализации вызова и разрешений устройства ещё предстоит выполнить.</p>
        <div class="rim-call-card"><span class="call-icon">☎</span><div class="grow"><b>Голосовой звонок</b><div class="feature-small">Функция находится в разработке</div></div><span class="badge">Скоро</span></div>
        <div class="rim-call-card"><span class="call-icon">▣</span><div class="grow"><b>Видеозвонок</b><div class="feature-small">Функция находится в разработке</div></div><span class="badge">Скоро</span></div>
        <p class="feature-small">Мы готовим защищённое соединение и удобный интерфейс вызовов. Кнопки пока не начинают реальный звонок.</p>
      </div>`
    );
  }
}
