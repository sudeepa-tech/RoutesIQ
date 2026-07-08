import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, clusterStops, optimizeFleet } from '../src/services/optimizer.js';

test('haversineKm returns 0 for identical points', () => {
  const p = { lat: 12.9, lng: 77.6 };
  assert.equal(haversineKm(p, p), 0);
});

test('haversineKm matches a known approximate distance', () => {
  // Bengaluru city center to Whitefield, ~15km
  const a = { lat: 12.9716, lng: 77.5946 };
  const b = { lat: 12.9698, lng: 77.7499 };
  const d = haversineKm(a, b);
  assert.ok(d > 14 && d < 18, `expected ~15km, got ${d}`);
});

test('clusterStops respects vehicle capacity', () => {
  const vehicles = [
    { id: 'V1', capacity: 5 },
    { id: 'V2', capacity: 5 },
  ];
  const stops = Array.from({ length: 10 }, (_, i) => ({
    id: `S${i}`,
    lat: 12.9 + i * 0.01,
    lng: 77.6 + i * 0.01,
    headcount: 1,
  }));
  const assignment = clusterStops(stops, vehicles);
  for (const [vehicleId, clusterStopsList] of assignment) {
    const load = clusterStopsList.reduce((s, st) => s + st.headcount, 0);
    const cap = vehicles.find((v) => v.id === vehicleId).capacity;
    assert.ok(load <= cap, `vehicle ${vehicleId} overloaded: ${load} > ${cap}`);
  }
});

test('optimizeFleet throws when fleet capacity is insufficient', () => {
  const vehicles = [{ id: 'V1', capacity: 1 }];
  const stops = [
    { id: 'S1', lat: 12.9, lng: 77.6, headcount: 1 },
    { id: 'S2', lat: 12.91, lng: 77.61, headcount: 1 },
  ];
  assert.throws(() => optimizeFleet({ stops, vehicles, depot: { lat: 12.9, lng: 77.6 } }));
});

test('optimizeFleet produces routes for every rider with no overload', () => {
  const vehicles = [
    { id: 'V1', capacity: 4 },
    { id: 'V2', capacity: 4 },
  ];
  const stops = [
    { id: 'S1', lat: 12.90, lng: 77.60, headcount: 2 },
    { id: 'S2', lat: 12.91, lng: 77.61, headcount: 2 },
    { id: 'S3', lat: 12.95, lng: 77.70, headcount: 2 },
    { id: 'S4', lat: 12.96, lng: 77.71, headcount: 2 },
  ];
  const depot = { lat: 12.899, lng: 77.7507 };
  const result = optimizeFleet({ stops, vehicles, depot });

  const totalRiders = result.plans.reduce((s, p) => s + p.riders, 0);
  assert.equal(totalRiders, 8);
  for (const plan of result.plans) {
    assert.ok(plan.riders <= plan.vehicle.capacity);
  }
  assert.ok(result.summary.optimizedDistanceKm <= result.summary.baselineDistanceKm);
});
