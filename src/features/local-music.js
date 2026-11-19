import { summarizeMusic, formatListeningTime } from '../domain/music-statistics.js';
const DB_NAME = 'rim-local-media';
const DB_VERSION = 2;
const STORE = 'tracks';
const openDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(STORE)) { const store = db.createObjectStore(STORE, { keyPath: 'id' }); store.createIndex('title', 'title'); store.createIndex('artist', 'artist'); } };
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
const transaction = async (mode, action) => { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE, mode); const store = tx.objectStore(STORE); let result; try { result = action(store); } catch (error) { reject(error); return; } tx.oncomplete = () => { db.close(); resolve(result?.result ?? result); }; tx.onerror = () => { db.close(); reject(tx.error); }; tx.onabort = () => { db.close(); reject(tx.error); }; }); };
const requestValue = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const parseName = file => { const base = file.name.replace(/\.[^.]+$/, ''); const parts = base.split(/\s[-–—]\s/); return parts.length > 1 ? { artist: parts.shift().trim(), title: parts.join(' - ').trim() } : { artist: 'Неизвестный исполнитель', title: base }; };
export class LocalMusicLibrary {
  constructor({ root, logger, client = null, getUser = () => null }) { this.root = root; this.logger = logger; this.client = client; this.getUser = getUser; this.objectUrls = new Map(); this.query = ''; this.filter = 'all'; this.expanded = new Set(); this.audio = null; this.activeTrack = null; this.activeTrackRecord = null; this.sessionSeconds = 0; this.lastTickAt = 0; this.lastPersistAt = 0; this.completedForSession = false; this.persistPromise = Promise.resolve(); }
  async all() { const db = await openDb(); try { return await requestValue(db.transaction(STORE).objectStore(STORE).getAll()); } finally { db.close(); } }
  async addFiles(files) {
    const audioFiles = [...files].filter(file => file.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|opus|wav|flac|webm)$/i.test(file.name));
    if (!audioFiles.length) throw new Error('Не выбраны аудиофайлы поддерживаемого формата.');
    const records = audioFiles.map(file => { const parsed = parseName(file); return { id: crypto.randomUUID(), title: parsed.title, artist: parsed.artist, fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, blob: file, addedAt: new Date().toISOString(), plays: 0, completedPlays: 0, listenedSeconds: 0, dailyPlays: {}, favorite: false, lastPlayedAt: null }; });
    await transaction('readwrite', store => { for (const record of records) store.put(record); });
    try { await this.uploadToCloud(records); } catch (error) { this.logger?.warn?.('music.cloud.upload.failed', { message: error?.message || String(error) }); }
    await this.render(); return audioFiles.length;
  }
  async update(id, patch) { await transaction('readwrite', store => { const req = store.get(id); req.onsuccess = () => { if (req.result) store.put({ ...req.result, ...patch }); }; }); }
  async remove(id) { await transaction('readwrite', store => store.delete(id)); const url = this.objectUrls.get(id); if (url) URL.revokeObjectURL(url); this.objectUrls.delete(id); await this.render(); }
  persistSession(final = false) {
    const persist = async () => {
      if (!this.activeTrack || this.sessionSeconds <= 0) return;
      const now = Date.now();
      if (!final && now - this.lastPersistAt < 10000) return;
      const seconds = Math.floor(this.sessionSeconds);
      if (!seconds) return;
      const track = this.activeTrackRecord;
      if (!track) return;
      const listenedSeconds = (track.listenedSeconds || 0) + seconds;
      await this.update(track.id, { listenedSeconds });
      this.activeTrackRecord = { ...track, listenedSeconds };
      this.sessionSeconds -= seconds; this.lastPersistAt = now;
    };
    this.persistPromise = this.persistPromise.then(persist, persist);
    return this.persistPromise;
  }
  async finishSession(completed = false) {
    if (!this.activeTrack) return;
    const id = this.activeTrack;
    await this.persistSession(true);
    if (completed && !this.completedForSession) {
      this.completedForSession = true;
      const track = this.activeTrackRecord;
      if (track) {
        const completedPlays = (track.completedPlays || 0) + 1;
        await this.update(id, { completedPlays });
        this.activeTrackRecord = { ...track, completedPlays };
      }
    }
    this.activeTrack = null; this.activeTrackRecord = null; this.sessionSeconds = 0; this.completedForSession = false;
  }
  bindAudio(audio) {
    if (audio.dataset.rimStatsBound) return;
    audio.dataset.rimStatsBound = '1';
    audio.addEventListener('timeupdate', async () => {
      if (!this.activeTrack || audio.paused) return;
      const now = Date.now();
      if (this.lastTickAt) this.sessionSeconds += Math.min(2, Math.max(0, (now - this.lastTickAt) / 1000));
      this.lastTickAt = now;
      const duration = Number(audio.duration);
      if (!this.completedForSession && Number.isFinite(duration) && duration > 0 && audio.currentTime / duration >= 0.9) {
        const track = this.activeTrackRecord;
        if (track) {
          const completedPlays = (track.completedPlays || 0) + 1;
          await this.update(track.id, { completedPlays });
          this.activeTrackRecord = { ...track, completedPlays };
        }
        this.completedForSession = true;
      }
      await this.persistSession(false);
    });
    audio.addEventListener('pause', () => { this.lastTickAt = 0; this.persistSession(true).catch(error => this.logger.warn('music.stats.persist.failed', { message: error.message })); });
    audio.addEventListener('ended', () => { this.finishSession(true).catch(error => this.logger.warn('music.stats.finish.failed', { message: error.message })); });
  }
  dispose() { this.audio?.pause?.(); if (this.activeTrack) this.finishSession(false).catch(() => {}); for (const url of this.objectUrls.values()) URL.revokeObjectURL(url); this.objectUrls.clear(); this.audio = null; }
  async play(id, audio) {
    const tracks = await this.allMerged(); const track = tracks.find(x => x.id === id); if (!track) return;
    if (track.remoteUrl) {
      audio.src = track.remoteUrl;
      this.activeTrack = id; this.activeTrackRecord = track;
      await audio.play();
      return;
    }
    if (this.activeTrack && this.activeTrack !== id) await this.finishSession(false);
    let url = track.remoteUrl || this.objectUrls.get(id);
    if (!url) {
      if (!track.blob) throw new Error('Файл трека недоступен.');
      url = URL.createObjectURL(track.blob);
      this.objectUrls.set(id, url);
    }
    audio.src = url; this.audio = audio; this.bindAudio(audio);
    await audio.play();
    const day = new Date().toISOString().slice(0, 10);
    const dailyPlays = { ...(track.dailyPlays || {}), [day]: ((track.dailyPlays || {})[day] || 0) + 1 };
    const updatedTrack = { ...track, plays: (track.plays || 0) + 1, dailyPlays, lastPlayedAt: new Date().toISOString() };
    await this.update(id, { plays: updatedTrack.plays, dailyPlays, lastPlayedAt: updatedTrack.lastPlayedAt });
    this.activeTrack = id; this.activeTrackRecord = updatedTrack; this.sessionSeconds = 0; this.lastTickAt = Date.now(); this.lastPersistAt = Date.now(); this.completedForSession = false;
  }
  async render() {
    if (!this.root) return;
    const all = await this.allMerged(); const q = this.query.trim().toLocaleLowerCase('ru');
    const tracks = all.filter(t => (this.filter === 'all' || (this.filter === 'favorites' && t.favorite) || (this.filter === 'top' && (t.plays || 0) > 0)) && (!q || `${t.title} ${t.artist} ${t.fileName}`.toLocaleLowerCase('ru').includes(q)));
    const stats = summarizeMusic(all); const { starts: plays, completed, today: todayPlays, week: weekPlays } = stats;
    const favorites = stats.favoriteCount; const durationLabel = formatListeningTime(stats.listenedSeconds);
    const artistStats = Object.values(all.reduce((acc, t) => { const key = t.artist || 'Неизвестный исполнитель'; acc[key] ||= { artist: key, plays: 0, tracks: 0 }; acc[key].plays += t.plays || 0; acc[key].tracks++; return acc; }, {})).sort((a,b) => b.plays-a.plays).slice(0,5);
    this.root.innerHTML = `<section class="rim-local-music"><header class="rim-local-music-head"><div><h1>Музыка на устройстве</h1><p>Файлы хранятся только в этом браузере на этом устройстве. На сервер ничего не загружается.</p></div><button class="icon-btn" type="button" data-close>×</button></header><div class="rim-local-music-actions"><label class="primary-btn rim-file-pick">＋ Добавить файлы с телефона<input type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac" multiple hidden data-files></label><label class="action-btn rim-file-pick">Выбрать папку<input type="file" accept="audio/*" webkitdirectory directory multiple hidden data-folder></label></div><div class="rim-local-music-stats"><div><b>${all.length}</b><span>Треков</span></div><div><b>${plays}</b><span>Запусков · всё время</span></div><div><b>${favorites}</b><span>Избранное</span></div><div><b>${completed}</b><span>Полных прослушиваний</span></div><div><b>${durationLabel}</b><span>Время прослушивания</span></div><div><b>${todayPlays} / ${weekPlays}</b><span>Сегодня / 7 дней</span></div></div><div class="rim-local-filters"><button class="action-btn ${this.filter==='all'?'active':''}" data-filter="all">Все</button><button class="action-btn ${this.filter==='favorites'?'active':''}" data-filter="favorites">★ Избранное</button><button class="action-btn ${this.filter==='top'?'active':''}" data-filter="top">Часто слушаю</button></div><input class="field" type="search" placeholder="Поиск по названию или исполнителю" value="${this.escape(this.query)}" data-search><section class="rim-local-artists"><b>Исполнители</b>${artistStats.map(a=>`<span>${this.escape(a.artist)} · ${a.tracks} тр. · ${a.plays} просл.</span>`).join('') || '<span>Статистика появится после добавления музыки</span>'}</section><div class="rim-local-player" data-player-wrap hidden><div class="rim-local-player-title" data-player-title>Выберите трек</div><audio controls preload="metadata" data-player></audio></div><div class="rim-local-track-list">${tracks.map(t => `<article class="rim-local-track"><div class="rim-local-track-top"><button class="rim-local-track-toggle" data-expand="${t.id}" aria-expanded="${this.expanded.has(t.id)}">${this.expanded.has(t.id) ? '⌄' : '›'}</button><div class="rim-local-track-title"><b>${this.escape(t.title)}</b><small>${this.escape(t.artist)} · ${(t.size / 1048576).toFixed(1)} МБ</small></div><button class="action-btn" data-play="${t.id}">▶</button><button class="action-btn" data-fav="${t.id}">${t.favorite ? '★' : '☆'}</button></div><div class="rim-local-track-details" ${this.expanded.has(t.id) ? '' : 'hidden'}><div data-track-stats="${t.id}">${t.plays || 0} запусков · ${t.completedPlays || 0} полных · ${Math.floor((t.listenedSeconds || 0) / 60)} мин</div><div>Добавлен: ${new Date(t.addedAt).toLocaleDateString('ru-RU')}</div><div>Последнее прослушивание: ${t.lastPlayedAt ? new Date(t.lastPlayedAt).toLocaleString('ru-RU') : '—'}</div><button class="action-btn danger-btn" data-remove="${t.id}">Удалить с устройства</button></div></article>`).join('') || `<div class="empty-state">${all.length ? 'Ничего не найдено.' : 'Музыкальная библиотека пуста. Выберите аудиофайлы на телефоне.'}</div>`}</div></section>`;
    this.root.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { this.filter = b.dataset.filter; this.render(); }));
    this.root.querySelector('[data-close]')?.addEventListener('click', () => { this.dispose(); this.root.innerHTML = ''; document.getElementById('app')?.classList.remove('rim-feature-hidden'); });
    const add = async input => { try { const count = await this.addFiles(input.files || []); this.logger.info('music.files.added', { count }); } catch (e) { alert(e.message); } input.value = ''; };
    this.root.querySelector('[data-files]')?.addEventListener('change', e => add(e.currentTarget)); this.root.querySelector('[data-folder]')?.addEventListener('change', e => add(e.currentTarget));
    this.root.querySelector('[data-search]')?.addEventListener('input', e => { this.query = e.target.value; const pos = e.target.selectionStart; this.render().then(() => { const n = this.root.querySelector('[data-search]'); n?.focus(); n?.setSelectionRange(pos, pos); }); });
    this.root.querySelectorAll('[data-expand]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.expand; this.expanded.has(id) ? this.expanded.delete(id) : this.expanded.add(id); this.render(); }));
    this.root.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', async () => { const t = (await this.allMerged()).find(x => x.id === b.dataset.fav); await this.update(t.id, { favorite: !t.favorite }); await this.render(); }));
    this.root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async () => { if (confirm('Удалить этот локальный файл из библиотеки РИМа? Исходный файл в папке телефона не изменится.')) await this.remove(b.dataset.remove); }));
    this.root.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', async () => { const wrap = this.root.querySelector('[data-player-wrap]'); const audio = this.root.querySelector('[data-player]'); const track = (await this.allMerged()).find(x => x.id === b.dataset.play); wrap.hidden = false; this.root.querySelector('[data-player-title]').textContent = `${track.artist} — ${track.title}`; try { await this.play(track.id, audio); } catch (e) { this.logger.warn('music.play.failed', { message: e.message }); alert('Не удалось воспроизвести файл: ' + e.message); } }));
  }

  async uploadToCloud(records) {
    const user = this.getUser?.();
    const client = this.client;
    if (!user?.id || !client?.storage || !records?.length) return;
    for (const record of records) {
      try {
        const safeName = String(record.fileName || 'track').replace(/[^a-zA-Z0-9._-]+/g, '_');
        const path = `${user.id}/music/${record.id}-${safeName}`;
        if (!record.blob) continue;
        const { error: up } = await client.storage.from('music-library').upload(path, record.blob, {
          contentType: record.mimeType || 'audio/mpeg',
          upsert: false
        });
        if (up) { this.logger?.warn?.('music.cloud.storage', { message: up.message }); continue; }
        await client.from('music_tracks').insert({
          id: record.id,
          user_id: user.id,
          title: record.title,
          artist: record.artist,
          file_path: path,
          visibility: 'private'
        });
      } catch (error) {
        this.logger?.warn?.('music.cloud.row', { message: error?.message || String(error) });
      }
    }
  }

  async remoteTracks() {
    const user = this.getUser?.();
    const client = this.client;
    if (!user?.id || !client?.from) return [];
    try {
      const { data, error } = await client.from('music_tracks')
        .select('id,title,artist,file_path')
        .eq('user_id', user.id)
        .order('title')
        .limit(200);
      if (error || !data?.length) return [];
      const paths = data.map(row => row.file_path).filter(Boolean);
      let urlMap = {};
      if (paths.length) {
        const { data: signed } = await client.storage.from('music-library').createSignedUrls(paths, 3600);
        urlMap = Object.fromEntries((signed || []).filter(x => x.path && x.signedUrl).map(x => [x.path, x.signedUrl]));
      }
      return data.map(row => ({
        id: row.id,
        title: row.title || 'Трек',
        artist: row.artist || 'Неизвестный исполнитель',
        fileName: row.file_path,
        mimeType: 'audio/mpeg',
        size: 0,
        remoteUrl: urlMap[row.file_path] || null,
        blob: null,
        addedAt: new Date().toISOString(),
        plays: 0,
        completedPlays: 0,
        listenedSeconds: 0,
        dailyPlays: {},
        favorite: false,
        lastPlayedAt: null,
        cloudOnly: true
      })).filter(row => row.remoteUrl);
    } catch (error) {
      this.logger?.warn?.('music.cloud.list', { message: error?.message || String(error) });
      return [];
    }
  }

  async allMerged() {
    const local = await this.all();
    const remote = await this.remoteTracks();
    const map = new Map(local.map(track => [String(track.id), track]));
    for (const track of remote) {
      if (!map.has(String(track.id))) map.set(String(track.id), track);
    }
    return [...map.values()];
  }

  escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
}
