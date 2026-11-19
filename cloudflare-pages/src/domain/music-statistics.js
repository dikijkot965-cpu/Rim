const DAY_MS = 24 * 60 * 60 * 1000;

export function summarizeMusic(tracks, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const weekStart = new Date(now.getTime() - 6 * DAY_MS);
  const weekKey = weekStart.toISOString().slice(0, 10);
  const totals = tracks.reduce((acc, track) => {
    const daily = track.dailyPlays || {};
    acc.starts += Number.isFinite(track.plays) ? track.plays : 0;
    acc.completed += Number.isFinite(track.completedPlays) ? track.completedPlays : 0;
    acc.listenedSeconds += Number.isFinite(track.listenedSeconds) ? track.listenedSeconds : 0;
    acc.today += Number.isFinite(daily[today]) ? daily[today] : 0;
    for (const [day, count] of Object.entries(daily)) {
      if (day >= weekKey && day <= today && Number.isFinite(count)) acc.week += count;
    }
    return acc;
  }, { starts: 0, completed: 0, listenedSeconds: 0, today: 0, week: 0 });
  return Object.freeze({ ...totals, trackCount: tracks.length, favoriteCount: tracks.filter(x => x.favorite).length });
}

export function formatListeningTime(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safe / 3600)} ч ${Math.floor((safe % 3600) / 60)} мин`;
}
