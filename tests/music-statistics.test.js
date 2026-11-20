import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMusic, formatListeningTime } from '../src/domain/music-statistics.js';

test('music statistics aggregate starts, completions, time and daily periods', () => {
  const stats = summarizeMusic([
    { plays: 4, completedPlays: 2, listenedSeconds: 3661, favorite: true, dailyPlays: { '2026-11-07': 2, '2026-11-01': 2 } },
    { plays: 3, completedPlays: 1, listenedSeconds: 120, favorite: false, dailyPlays: { '2026-11-07': 1, '2026-11-06': 2 } }
  ], new Date('2026-11-07T12:00:00Z'));
  assert.equal(stats.starts, 7);
  assert.equal(stats.completed, 3);
  assert.equal(stats.listenedSeconds, 3781);
  assert.equal(stats.today, 3);
  assert.equal(stats.week, 7);
  assert.equal(stats.trackCount, 2);
  assert.equal(stats.favoriteCount, 1);
  assert.equal(stats.artistCount, 1);
  assert.equal(stats.completionRate, 43);
  assert.equal(stats.averageListenSeconds, 540);
  assert.equal(stats.dailyLast7.length, 7);
  assert.equal(stats.topTracks.length, 2);
});

test('listening time formatting is safe for missing and negative values', () => {
  assert.equal(formatListeningTime(3661), '1 ч 1 мин');
  assert.equal(formatListeningTime(-3), '0 ч 0 мин');
  assert.equal(formatListeningTime(undefined), '0 ч 0 мин');
});
