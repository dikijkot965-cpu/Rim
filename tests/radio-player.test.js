import test from 'node:test';
import assert from 'node:assert/strict';
import { RIM_RADIO_STATIONS } from '../src/features/radio-player.js';

test('radio catalogue contains requested Russian stations with secure HTTPS streams', () => {
  const byId = new Map(RIM_RADIO_STATIONS.map(station => [station.id, station]));
  for (const id of ['detskoe', 'dorozhnoe', 'marusya', 'mayak']) assert.ok(byId.has(id), `missing ${id}`);
  for (const station of RIM_RADIO_STATIONS) {
    assert.match(station.url, /^https:\/\//, `${station.name} must use HTTPS`);
    assert.ok(station.name && station.category && station.description && station.source);
  }
});

test('radio catalogue has usable category groups and unique station identifiers', () => {
  const ids = RIM_RADIO_STATIONS.map(station => station.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(RIM_RADIO_STATIONS.some(station => station.category === 'Русская музыка'));
  assert.ok(RIM_RADIO_STATIONS.some(station => station.category === 'Новости и разговорное'));
  assert.ok(RIM_RADIO_STATIONS.some(station => station.category === 'Семейное'));
});


test('radio catalogue expands with additional Russian-language stations', () => {
  const byId = new Map(RIM_RADIO_STATIONS.map(station => [station.id, station]));
  for (const id of ['zvezda', 'radiovanya', 'radiomir', 'montecarlo', 'mcgold', 'dfm90']) {
    assert.ok(byId.has(id), `missing ${id}`);
  }
});
