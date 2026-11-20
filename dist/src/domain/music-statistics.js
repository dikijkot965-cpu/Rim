const DAY_MS = 24 * 60 * 60 * 1000;

export function summarizeMusic(tracks, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const weekStart = new Date(now.getTime() - 6 * DAY_MS);
  const weekKey = weekStart.toISOString().slice(0, 10);
  const daily = new Map();
  const artists = new Map();
  const totals = tracks.reduce((acc, track) => {
    const plays = Number.isFinite(Number(track.plays)) ? Math.max(0, Number(track.plays)) : 0;
    const completedPlays = Number.isFinite(Number(track.completedPlays)) ? Math.max(0, Number(track.completedPlays)) : 0;
    const listenedSeconds = Number.isFinite(Number(track.listenedSeconds)) ? Math.max(0, Number(track.listenedSeconds)) : 0;
    const dailyPlays = track.dailyPlays && typeof track.dailyPlays === 'object' ? track.dailyPlays : {};
    acc.starts += plays;
    acc.completed += completedPlays;
    acc.listenedSeconds += listenedSeconds;
    acc.totalBytes += Number.isFinite(Number(track.size)) ? Math.max(0, Number(track.size)) : 0;
    acc.today += Number.isFinite(Number(dailyPlays[today])) ? Number(dailyPlays[today]) : 0;
    const artist = String(track.artist || 'Неизвестный исполнитель');
    artists.set(artist, (artists.get(artist) || 0) + plays);
    for (const [day, countValue] of Object.entries(dailyPlays)) {
      const count = Number(countValue);
      if (!Number.isFinite(count) || count < 0 || day < weekKey || day > today) continue;
      daily.set(day, (daily.get(day) || 0) + count);
      acc.week += count;
    }
    return acc;
  }, { starts: 0, completed: 0, listenedSeconds: 0, totalBytes: 0, today: 0, week: 0 });

  const dailyLast7 = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.getTime() + index * DAY_MS);
    const key = date.toISOString().slice(0, 10);
    return Object.freeze({ date: key, label: new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date), plays: daily.get(key) || 0 });
  });
  const topTracks = [...tracks].sort((a, b) => (Number(b.plays) || 0) - (Number(a.plays) || 0)).slice(0, 5);
  const topArtists = [...artists.entries()].map(([artist, plays]) => ({ artist, plays })).sort((a, b) => b.plays - a.plays).slice(0, 5);
  const result = {
    ...totals,
    trackCount: tracks.length,
    artistCount: artists.size,
    favoriteCount: tracks.filter(track => track.favorite).length,
    completionRate: totals.starts ? Math.min(100, Math.round((totals.completed / totals.starts) * 100)) : 0,
    averageListenSeconds: totals.starts ? Math.round(totals.listenedSeconds / totals.starts) : 0,
    dailyLast7,
    topTracks,
    topArtists
  };
  return Object.freeze(result);
}

export function formatListeningTime(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours} ч ${minutes} мин`;
}

export function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${Math.round(value)} Б`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} КБ`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} МБ`;
  return `${(value / 1024 ** 3).toFixed(2)} ГБ`;
}
