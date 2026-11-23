const STATIONS = Object.freeze([
  { id: 'marusya', name: 'Маруся FM', category: 'Русская музыка', mood: 'Новые русские хиты', description: 'Современная русскоязычная популярная музыка', url: 'https://radio-holding.ru:9433/marusya_default', source: 'marus.fm' },
  { id: 'detskoe', name: 'Детское радио', category: 'Семейное', mood: 'Детское · Семейное', description: 'Песни, сказки и познавательные программы для детей', url: 'https://hls-01-gpm.hostingradio.ru/detifm3022/64/playlist.m3u8', source: 'Детское радио · HLS' },
  { id: 'dorozhnoe', name: 'Дорожное радио', category: 'Русская музыка', mood: 'Поп · Ретро · Дорожное', description: 'Знакомые песни, хиты прошлых лет и дорожные программы', url: 'https://dorognoe.hostingradio.ru/dorognoe', source: 'dorognoe.hostingradio.ru' },
  { id: 'mayak', name: 'Радио Маяк', category: 'Новости и разговорное', mood: 'Информационное · Разговорное', description: 'Общественные темы, интервью, познавательные и музыкальные программы', url: 'https://icecast-vgtrk.cdnvideo.ru/mayakfm_mp3_192kbps', source: 'ВГТРК' },
  { id: 'radiorussia', name: 'Радио России', category: 'Новости и разговорное', mood: 'Общественное · Информационное', description: 'Новости, аналитика, культура и региональные программы', url: 'https://icecast-vgtrk.cdnvideo.ru/rrzonam_mp3_128kbps', source: 'ВГТРК' },
  { id: 'vestifm', name: 'Вести FM', category: 'Новости и разговорное', mood: 'Новости · Аналитика', description: 'Информационное и общественно-политическое вещание', url: 'https://icecast.vgtrk.cdnvideo.ru/vestifm_mp3_192kbps', source: 'ВГТРК' },
  { id: 'rusradio', name: 'Русское Радио', category: 'Русская музыка', mood: 'Русская популярная музыка', description: 'Русскоязычные хиты и музыкальные программы', url: 'https://rusradio.hostingradio.ru/rusradio96.aacp', source: 'Русское Радио' },
  { id: 'nashe', name: 'Наше Радио', category: 'Русская музыка', mood: 'Рок · Русская сцена', description: 'Русский рок и музыка отечественных исполнителей', url: 'https://nashe1.hostingradio.ru/nashe-256', source: 'Наше Радио' },
  { id: 'europaplus', name: 'Европа Плюс', category: 'Музыка', mood: 'Поп · Хиты', description: 'Популярные музыкальные хиты и развлекательные программы', url: 'https://hls-01-regions.emgsound.ru/11_msk/96/playlist.m3u8', source: 'Европа Плюс · HLS' },
  { id: 'zvezda', name: 'Радио Звезда', category: 'Новости и разговорное', mood: 'История · Новости · Музыка', description: 'Исторические программы, новости, аудиокниги и музыка', url: 'https://zvezdafm.hostingradio.ru/zvezdafm128.mp3', source: 'Радио Звезда · поток партнёра' },
  { id: 'radiovanya', name: 'Радио Ваня', category: 'Русская музыка', mood: 'Поп · Танцевальная музыка', description: 'Популярная музыка и развлекательный эфир', url: 'https://icecast-radiovanya.cdnvideo.ru/radiovanya', source: 'Radio Vanya · Icecast' },
  { id: 'radiomir', name: 'Радио МИР', category: 'Русская музыка', mood: 'Русскоязычные хиты · Новости', description: 'Музыка, новости и разговорные программы', url: 'https://icecast.mirtv.cdnvideo.ru:8000/radio_mir128', source: 'МТРК «Мир» · потоковый каталог' },
  { id: 'montecarlo', name: 'Радио Монте-Карло', category: 'Музыка', mood: 'Мировые хиты · Lounge', description: 'Зарубежные хиты и музыкальные подборки', url: 'https://montecarlo.hostingradio.ru/montecarlo96.aacp', source: 'Monte Carlo · поток вещателя' },
  { id: 'mcgold', name: 'Монте-Карло Gold', category: 'Музыка', mood: 'Gold · Поп · Ретро', description: 'Золотые хиты и классика популярной музыки', url: 'https://mc-mcgold.hostingradio.ru/mcgold96.aacp', source: 'Monte Carlo Gold · поток вещателя' },
  { id: 'dfm90', name: 'DFM Дискач 90-х', category: 'Музыка', mood: '90-е · Dance · Eurodance', description: 'Танцевальные хиты девяностых', url: 'https://dfm-disc90.hostingradio.ru/disc9096.aacp', source: 'DFM · поток вещателя' },
  { id: 'groovesalad', name: 'Groove Salad', category: 'Зарубежные', mood: 'Ambient · Downtempo', description: 'Спокойная электроника и мягкие ритмы', url: 'https://ice.somafm.com/groovesalad', source: 'SomaFM' },
  { id: 'dronezone', name: 'Drone Zone', category: 'Зарубежные', mood: 'Atmospheric · Ambient', description: 'Атмосферные текстуры и медленные звуковые пейзажи', url: 'https://ice.somafm.com/dronezone', source: 'SomaFM' },
  { id: 'spacestation', name: 'Space Station Soma', category: 'Зарубежные', mood: 'Space · Electronic', description: 'Космическая электроника и экспериментальный эмбиент', url: 'https://ice.somafm.com/spacestation', source: 'SomaFM' },
  { id: 'indiepop', name: 'Indie Pop Rocks!', category: 'Зарубежные', mood: 'Indie · Alternative', description: 'Независимая музыка и альтернативная сцена', url: 'https://ice.somafm.com/indiepop', source: 'SomaFM' },
  { id: 'missioncontrol', name: 'Mission Control', category: 'Зарубежные', mood: 'Space · Soundscapes', description: 'Звуковое сопровождение для работы и концентрации', url: 'https://ice.somafm.com/missioncontrol', source: 'SomaFM' },
  { id: 'cliqhop', name: 'cliqhop idm', category: 'Зарубежные', mood: 'IDM · Electronica', description: 'Ломаные ритмы и интеллектуальная электроника', url: 'https://ice.somafm.com/cliqhop', source: 'SomaFM' }
]);
const STORAGE_KEY = 'rim.radio.stats.v2';
const PREFERENCES_KEY = 'rim.radio.preferences.v1';
const DEFAULT_FEATURED = ['marusya', 'detskoe', 'dorozhnoe'];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export class RadioPlayer {
  constructor({ logger = null, storage = globalThis.localStorage } = {}) {
    this.logger = logger;
    this.storage = storage;
    this.station = null;
    this.hls = null;
    this.lastTick = 0;
    this.pendingSeconds = 0;
    this.stats = this.readStats();
    this.preferences = this.readPreferences();
    this.expanded = false;
    this.manualPause = false;
    this.retryCount = 0;
    this.retryTimer = null;
    this.sleepTimer = null;
    this.element = document.createElement('section');
    this.element.className = 'rim-radio-card';
    this.element.innerHTML = `
      <div class="rim-radio-head"><div><span class="rim-radio-eyebrow">RIM RADIO · LIVE</span><h2>Интернет-радио</h2><p>Российские эфиры, детское радио, новости, музыка и зарубежные станции</p></div><span class="rim-radio-live" data-radio-live>● ОЖИДАНИЕ</span></div>
      <div class="rim-radio-now"><div class="rim-radio-art" aria-hidden="true">♫</div><div class="rim-radio-now-copy"><small>СЕЙЧАС В ЭФИРЕ</small><b data-radio-station>Выберите станцию</b><span data-radio-mood>Радио RIM</span></div></div>
      <div class="rim-radio-controls"><button class="primary-btn" type="button" data-radio-toggle>▶ Слушать</button><label class="rim-radio-volume">Громкость <input type="range" min="0" max="1" step="0.05" value="0.75" data-radio-volume></label><label class="rim-radio-sleep">Таймер <select data-radio-sleep><option value="0">Без таймера</option><option value="15">15 мин</option><option value="30">30 мин</option><option value="45">45 мин</option><option value="60">60 мин</option><option value="90">90 мин</option></select></label></div>
      <audio preload="none" data-radio-audio></audio>
      <div class="rim-radio-library-tools"><label class="rim-radio-search"><span>Найти станцию</span><input type="search" data-radio-search placeholder="Название или жанр…" autocomplete="off"></label><div class="rim-radio-filters" data-radio-filters>${['Все','Избранное','Русская музыка','Новости и разговорное','Семейное','Музыка','Зарубежные'].map((category,index) => `<button type="button" class="rim-radio-filter${index===0?' active':''}" data-radio-filter="${category}">${category}</button>`).join('')}</div></div>
      <div class="rim-radio-station-tools"><button type="button" class="action-btn" data-radio-expand aria-expanded="false">Показать все станции</button><button type="button" class="action-btn" data-radio-configure>Настроить список</button></div>
      <div class="rim-radio-config" data-radio-config hidden><b>Станции в кратком списке</b><p>Выберите избранные станции и количество карточек, видимых без раскрытия списка.</p><label>Показывать <select class="field" data-radio-featured-limit><option value="3">3 станции</option><option value="5">5 станций</option><option value="10">10 станций</option></select></label><div class="rim-radio-config-options">${STATIONS.map(station => `<label><input type="checkbox" data-radio-featured="${station.id}"> ${station.name}</label>`).join('')}</div><button type="button" class="primary-btn" data-radio-save-config>Сохранить</button></div>
      <div class="rim-radio-stations" data-radio-stations>${STATIONS.map(station => `<article class="rim-radio-station" data-station-card="${station.id}"><button type="button" class="rim-radio-play" data-station="${station.id}" aria-label="Слушать ${station.name}"><b>${station.name}</b><small>${station.mood}</small><span>${station.description}</span></button><button type="button" class="rim-radio-favorite" data-radio-favorite="${station.id}" aria-label="Добавить в избранное">☆</button></article>`).join('')}</div>
      <div class="rim-radio-empty" data-radio-empty hidden>По вашему запросу ничего не найдено.</div>
      <div class="rim-radio-stats"><div><b data-radio-starts>${this.stats.starts}</b><small>Запусков</small></div><div><b data-radio-minutes>${Math.floor(this.stats.seconds / 60)}</b><small>Минут в эфире</small></div><div><b data-radio-last-station>${this.stats.favoriteStation ? STATIONS.find(s => s.id === this.stats.favoriteStation)?.name || '—' : '—'}</b><small>Последняя станция</small></div></div>
      <p class="rim-radio-footnote">Потоки поступают от вещателей и их технических партнёров. Адреса и доступность могут меняться; некоторые HLS-потоки поддерживаются не всеми браузерами. Для включения нажмите на карточку станции.</p>`;
    this.audio = this.element.querySelector('[data-radio-audio]');
    this.toggleButton = this.element.querySelector('[data-radio-toggle]');
    this.status = this.element.querySelector('[data-radio-live]');
    this.activeCategory = 'Все';
    this.bind();
    this.element.querySelector('[data-radio-featured-limit]').value = String(this.preferences.displayLimit);
    this.renderStationVisibility();
  }

  readPreferences() {
    try {
      const value = JSON.parse(this.storage?.getItem(PREFERENCES_KEY) || 'null');
      const valid = Array.isArray(value?.featuredStationIds) ? value.featuredStationIds.filter(id => STATIONS.some(station => station.id === id)) : DEFAULT_FEATURED;
      return { featuredStationIds: [...new Set(valid.length ? valid : DEFAULT_FEATURED)], displayLimit: [3, 5, 10].includes(Number(value?.displayLimit)) ? Number(value.displayLimit) : 3 };
    } catch { return { featuredStationIds: [...DEFAULT_FEATURED], displayLimit: 3 }; }
  }
  savePreferences() {
    try { this.storage?.setItem(PREFERENCES_KEY, JSON.stringify(this.preferences)); }
    catch (error) { this.logger?.warn?.('radio.preferences.persist.failed', { message: error?.message || String(error) }); }
  }
  renderStationVisibility() {
    const visibleFeatured = this.preferences.featuredStationIds.slice(0, this.preferences.displayLimit);
    this.element.querySelectorAll('[data-station-card]').forEach(card => {
      const isFeatured = visibleFeatured.includes(card.dataset.stationCard);
      const hiddenByCollapse = !this.expanded && !isFeatured;
      const matchesCategory = this.activeCategory === 'Все' || (this.activeCategory === 'Избранное' ? this.stats.favorites.includes(card.dataset.stationCard) : STATIONS.find(item => item.id === card.dataset.stationCard)?.category === this.activeCategory);
      const query = (this.element.querySelector('[data-radio-search]')?.value || '').trim().toLocaleLowerCase('ru');
      const station = STATIONS.find(item => item.id === card.dataset.stationCard);
      const matchesQuery = !query || `${station?.name} ${station?.category} ${station?.mood} ${station?.description}`.toLocaleLowerCase('ru').includes(query);
      card.hidden = hiddenByCollapse || !matchesCategory || !matchesQuery;
    });
    const button = this.element.querySelector('[data-radio-expand]');
    if (button) { button.textContent = this.expanded ? 'Свернуть список' : 'Показать все станции'; button.setAttribute('aria-expanded', String(this.expanded)); }
    const empty = this.element.querySelector('[data-radio-empty]');
    if (empty) empty.hidden = [...this.element.querySelectorAll('[data-station-card]')].some(card => !card.hidden);
  }

  readStats() {
    try {
      const parsed = JSON.parse(this.storage?.getItem(STORAGE_KEY) || this.storage?.getItem('rim.radio.stats.v1') || '{}');
      return { starts: Math.max(0, Number(parsed.starts) || 0), seconds: Math.max(0, Number(parsed.seconds) || 0), favoriteStation: String(parsed.favoriteStation || ''), favorites: Array.isArray(parsed.favorites) ? [...new Set(parsed.favorites.map(String))] : [] };
    } catch { return { starts: 0, seconds: 0, favoriteStation: '', favorites: [] }; }
  }
  saveStats() {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.stats)); }
    catch (error) { this.logger?.warn?.('radio.stats.persist.failed', { message: error?.message || String(error) }); }
    const starts = this.element.querySelector('[data-radio-starts]');
    const minutes = this.element.querySelector('[data-radio-minutes]');
    const favorite = this.element.querySelector('[data-radio-last-station]');
    if (starts) starts.textContent = String(this.stats.starts);
    if (minutes) minutes.textContent = String(Math.floor(this.stats.seconds / 60));
    if (favorite) favorite.textContent = STATIONS.find(s => s.id === this.stats.favoriteStation)?.name || '—';
    this.element.querySelectorAll('[data-radio-favorite]').forEach(button => {
      const active = this.stats.favorites.includes(button.dataset.radioFavorite);
      button.textContent = active ? '★' : '☆';
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  bind() {
    this.element.querySelectorAll('[data-station]').forEach(button => button.addEventListener('click', () => {
      const station = STATIONS.find(item => item.id === button.dataset.station);
      if (station) void this.play(station).catch(() => {});
    }));
    this.element.querySelectorAll('[data-radio-favorite]').forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.radioFavorite;
      const favorites = new Set(this.stats.favorites);
      if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
      this.stats.favorites = [...favorites];
      this.saveStats();
    }));
    this.element.querySelector('[data-radio-sleep]').addEventListener('change', event => this.setSleepTimer(Number(event.target.value)));
    this.element.querySelector('[data-radio-search]').addEventListener('input', () => this.filterStations());
    this.element.querySelector('[data-radio-expand]').addEventListener('click', () => { this.expanded = !this.expanded; this.renderStationVisibility(); });
    this.element.querySelector('[data-radio-configure]').addEventListener('click', () => {
      const panel = this.element.querySelector('[data-radio-config]'); panel.hidden = !panel.hidden;
      panel.querySelector('[data-radio-featured-limit]').value = String(this.preferences.displayLimit);
      panel.querySelectorAll('[data-radio-featured]').forEach(input => { input.checked = this.preferences.featuredStationIds.includes(input.dataset.radioFeatured); });
    });
    this.element.querySelector('[data-radio-save-config]').addEventListener('click', () => {
      const selected = [...this.element.querySelectorAll('[data-radio-featured]:checked')].map(input => input.dataset.radioFeatured);
      if (!selected.length) { this.logger?.warn?.('radio.preferences.empty_selection', {}); return; }
      this.preferences = { featuredStationIds: selected, displayLimit: Number(this.element.querySelector('[data-radio-featured-limit]').value) || 3 };
      this.savePreferences(); this.element.querySelector('[data-radio-config]').hidden = true; this.renderStationVisibility();
    });
    this.element.querySelectorAll('[data-radio-filter]').forEach(button => button.addEventListener('click', () => {
      this.activeCategory = button.dataset.radioFilter;
      this.element.querySelectorAll('[data-radio-filter]').forEach(item => item.classList.toggle('active', item === button));
      this.filterStations();
    }));
    this.toggleButton.addEventListener('click', () => {
      if (this.audio.paused) {
        this.manualPause = false;
        if (!this.station) return;
        this.audio.play().catch(error => this.fail(error));
      } else { this.manualPause = true; this.clearRetry(); this.audio.pause(); }
    });
    this.element.querySelector('[data-radio-volume]').addEventListener('input', event => { this.audio.volume = Number(event.target.value); });
    this.audio.volume = 0.75;
    this.audio.addEventListener('playing', () => { this.retryCount = 0; this.clearRetry(); this.status.textContent = '● В ЭФИРЕ'; this.toggleButton.textContent = 'Ⅱ Пауза'; this.lastTick = Date.now(); });
    this.audio.addEventListener('pause', () => { this.flushTime(); this.status.textContent = '● ПАУЗА'; this.toggleButton.textContent = '▶ Продолжить'; this.lastTick = 0; });
    this.audio.addEventListener('timeupdate', () => this.trackTime());
    this.audio.addEventListener('error', () => this.fail(new Error('Поток недоступен')));
  }
  filterStations() {
    this.renderStationVisibility();
  }

  async play(station, { retry = false } = {}) {
    if (this.station?.id === station.id && !this.audio.paused && !retry) return;
    if (!retry) { this.manualPause = false; this.retryCount = 0; this.clearRetry(); }
    this.flushTime();
    this.station = station;
    this.element.querySelector('[data-radio-station]').textContent = station.name;
    this.element.querySelector('[data-radio-mood]').textContent = `${station.mood} · ${station.description} · Источник: ${station.source}`;
    this.element.querySelectorAll('[data-station-card]').forEach(card => card.classList.toggle('active', card.dataset.stationCard === station.id));
    this.hls?.destroy?.();
    this.hls = null;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    try {
      if (/\.m3u8(?:$|\?)/i.test(station.url) && !this.audio.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: Hls } = await import('https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.mjs');
        if (!Hls.isSupported()) throw new Error('Браузер не поддерживает HLS-поток этой станции');
        this.hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 30 });
        this.hls.loadSource(station.url);
        this.hls.attachMedia(this.audio);
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Тайм-аут подключения к радиопотоку')), 15000);
          this.hls.once(Hls.Events.MANIFEST_PARSED, () => { clearTimeout(timeout); resolve(); });
          this.hls.once(Hls.Events.ERROR, (_event, data) => { if (data?.fatal) { clearTimeout(timeout); reject(new Error('HLS-поток временно недоступен')); } });
        });
      } else this.audio.src = station.url;
      if (!retry) this.stats.starts += 1;
      this.stats.favoriteStation = station.id;
      this.saveStats();
      await this.audio.play();
    } catch (error) { this.fail(error); throw error; }
  }
  trackTime() {
    if (this.audio.paused) return;
    const now = Date.now();
    if (this.lastTick) this.pendingSeconds += Math.min(2, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    if (this.pendingSeconds >= 15) this.flushTime();
  }
  flushTime() {
    if (this.lastTick && !this.audio.paused) this.pendingSeconds += Math.min(2, Math.max(0, (Date.now() - this.lastTick) / 1000));
    this.lastTick = 0;
    const seconds = Math.floor(this.pendingSeconds);
    if (seconds > 0) { this.stats.seconds += seconds; this.pendingSeconds -= seconds; this.saveStats(); }
  }
  setSleepTimer(minutes) {
    clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    if (!minutes) { this.status.textContent = this.audio.paused ? '● ОЖИДАНИЕ' : '● В ЭФИРЕ'; return; }
    this.sleepTimer = setTimeout(() => {
      this.manualPause = true;
      this.clearRetry();
      this.audio.pause();
      this.status.textContent = '● ТАЙМЕР ЗАВЕРШЁН';
      const select = this.element.querySelector('[data-radio-sleep]');
      if (select) select.value = '0';
      this.sleepTimer = null;
    }, minutes * 60_000);
    this.status.textContent = `● ОТКЛЮЧЕНИЕ ЧЕРЕЗ ${minutes} МИН`;
  }
  clearRetry() { clearTimeout(this.retryTimer); this.retryTimer = null; }
  fail(error) {
    this.status.textContent = '● НЕТ СВЯЗИ';
    this.toggleButton.textContent = '▶ Повторить';
    this.logger?.warn?.('radio.stream.failed', { station: this.station?.id, message: error?.message || String(error) });
    if (!this.manualPause && this.station && this.retryCount < 3 && !this.retryTimer) {
      const delay = 1500 * (2 ** this.retryCount++);
      this.status.textContent = `● ПЕРЕПОДКЛЮЧЕНИЕ · ${Math.ceil(delay / 1000)} С`;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (this.station && !this.manualPause) void this.play(this.station, { retry: true }).catch(() => {});
      }, delay);
    }
  }
  dispose() { this.flushTime(); this.clearRetry(); clearTimeout(this.sleepTimer); this.sleepTimer = null; this.audio.pause(); this.hls?.destroy?.(); this.hls = null; this.audio.removeAttribute('src'); this.audio.load(); }
}

export { STATIONS as RIM_RADIO_STATIONS };
