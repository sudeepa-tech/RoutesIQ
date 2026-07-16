import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeArrivalSchedule, computeDepartureSchedule } from '../src/services/timing.js';
import { haversineKm } from '../src/services/optimizer.js';

const depot = { lat: 12.899129358584288, lng: 77.75070888668907 };
const stops = [
  { id: 'S1', lat: 12.95, lng: 77.80 },
  { id: 'S2', lat: 12.93, lng: 77.78 },
  { id: 'S3', lat: 12.91, lng: 77.76 },
];

test('pickup schedule always lands exactly on the fixed school arrival time', () => {
  const { timings, arrivalTime } = computeArrivalSchedule(depot, stops, { arrivalTime: '07:15', avgSpeedKmh: 25 });
  const last = timings[timings.length - 1];
  const arrivalAtSchool = last.durationToSchoolMinutes; // minutes from last stop to school
  // reconstruct arrival clock time from last pickup + its duration
  const [ph, pm] = last.pickupTime.split(':').map(Number);
  const totalMinutes = ph * 60 + pm + arrivalAtSchool;
  const [ah, am] = arrivalTime.split(':').map(Number);
  assert.equal(totalMinutes, ah * 60 + am);
});

test('pickup times are strictly increasing (farthest stop picked up first)', () => {
  const { timings } = computeArrivalSchedule(depot, stops, { arrivalTime: '07:15', avgSpeedKmh: 25 });
  for (let i = 1; i < timings.length; i++) {
    assert.ok(timings[i].pickupTime > timings[i - 1].pickupTime);
  }
});

test('duration to school decreases monotonically as the bus approaches campus', () => {
  const { timings } = computeArrivalSchedule(depot, stops, { arrivalTime: '07:15', avgSpeedKmh: 25 });
  for (let i = 1; i < timings.length; i++) {
    assert.ok(timings[i].durationToSchoolMinutes < timings[i - 1].durationToSchoolMinutes);
  }
});

test('drop schedule starts exactly at the fixed departure time for the first (nearest) stop', () => {
  const { timings, departureTime } = computeDepartureSchedule(depot, stops, { departureTime: '14:20', avgSpeedKmh: 25 });
  // first drop stop is the nearest to school (last pickup stop, S3)
  assert.equal(timings[0].stopId, 'S3');
  const [dh, dm] = departureTime.split(':').map(Number);
  const [th, tm] = timings[0].dropTime.split(':').map(Number);
  const elapsedMinutes = th * 60 + tm - (dh * 60 + dm);
  const expected = Math.round((haversineKm(depot, stops[2]) / 25) * 60);
  assert.equal(elapsedMinutes, expected);
});

test('drop order is the reverse of pickup order (nearest stop dropped first)', () => {
  const { timings } = computeDepartureSchedule(depot, stops, { departureTime: '14:20', avgSpeedKmh: 25 });
  assert.deepEqual(timings.map((t) => t.stopId), ['S3', 'S2', 'S1']);
});

test('empty stop list returns an empty pickup schedule without throwing', () => {
  const { timings } = computeArrivalSchedule(depot, [], { arrivalTime: '07:15' });
  assert.equal(timings.length, 0);
});
