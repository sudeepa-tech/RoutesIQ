import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStopTimings } from '../src/services/timing.js';

const depot = { lat: 12.899, lng: 77.7507 };

test('first stop ETA is after the route start time', () => {
  const stops = [{ id: 'S1', lat: 12.91, lng: 77.76 }];
  const timings = computeStopTimings(depot, stops, { routeStartTime: '07:00', avgSpeedKmh: 25 });
  assert.equal(timings.length, 1);
  assert.ok(timings[0].etaMinutesFromStart > 0);
  assert.match(timings[0].etaClockTime, /^\d{2}:\d{2}$/);
});

test('later stops have strictly increasing ETAs', () => {
  const stops = [
    { id: 'S1', lat: 12.91, lng: 77.76 },
    { id: 'S2', lat: 12.93, lng: 77.78 },
    { id: 'S3', lat: 12.95, lng: 77.80 },
  ];
  const timings = computeStopTimings(depot, stops, { routeStartTime: '07:00', avgSpeedKmh: 25 });
  for (let i = 1; i < timings.length; i++) {
    assert.ok(timings[i].etaMinutesFromStart > timings[i - 1].etaMinutesFromStart);
  }
});

test('higher average speed produces earlier ETAs', () => {
  const stops = [{ id: 'S1', lat: 12.95, lng: 77.80 }];
  const slow = computeStopTimings(depot, stops, { routeStartTime: '07:00', avgSpeedKmh: 15 });
  const fast = computeStopTimings(depot, stops, { routeStartTime: '07:00', avgSpeedKmh: 40 });
  assert.ok(fast[0].etaMinutesFromStart < slow[0].etaMinutesFromStart);
});
