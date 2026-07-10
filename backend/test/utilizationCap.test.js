import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeFleet } from '../src/services/optimizer.js';

const depot = { lat: 12.899, lng: 77.7507 };

function makeStops(n, lat, lng) {
  return Array.from({ length: n }, (_, i) => ({
    id: `S${i}`,
    lat: lat + i * 0.001,
    lng: lng + i * 0.001,
    headcount: 1,
  }));
}

test('targetUtilizationPct caps utilization below 100%', () => {
  const vehicles = [{ id: 'V1', capacity: 40 }, { id: 'V2', capacity: 40 }];
  const stops = makeStops(50, 12.90, 77.60); // 50 riders, 80 total real capacity, plenty of room
  const result = optimizeFleet({ stops, vehicles, depot, targetUtilizationPct: 70 });

  for (const plan of result.plans) {
    if (plan.riders === 0) continue;
    assert.ok(
      plan.utilization <= 100,
      `utilization ${plan.utilization}% must never exceed 100%`
    );
  }
  // total riders must still all be placed even under the cap, since
  // 70% of 80 = 56 >= 50 total riders
  const totalRiders = result.plans.reduce((s, p) => s + p.riders, 0);
  assert.equal(totalRiders, 50);
});

test('never exceeds real seat capacity even when the target cap is tight', () => {
  const vehicles = [{ id: 'V1', capacity: 40 }, { id: 'V2', capacity: 40 }];
  const stops = makeStops(70, 12.90, 77.60); // 70 riders vs 80 real capacity — tight
  const result = optimizeFleet({ stops, vehicles, depot, targetUtilizationPct: 50 });
  // 50% cap would only allow 40 total, but real capacity (80) can fit 70 —
  // the fallback must kick in and never put a vehicle over its real 40 seats
  for (const plan of result.plans) {
    assert.ok(plan.riders <= plan.vehicle.capacity);
  }
  const totalRiders = result.plans.reduce((s, p) => s + p.riders, 0);
  assert.equal(totalRiders, 70);
});

test('relaxes the cap (never beyond real capacity) rather than failing when the cap alone cannot fit everyone', () => {
  const vehicles = [{ id: 'V1', capacity: 10 }, { id: 'V2', capacity: 10 }];
  const stops = makeStops(20, 12.90, 77.60); // exactly fills real capacity (20)
  // at a 50% cap, effective capacity is only 10 total, but real capacity (20)
  // exactly fits — the optimizer should still place everyone, exceeding the
  // soft cap where necessary but never the real 10-seat limit per vehicle
  const result = optimizeFleet({ stops, vehicles, depot, targetUtilizationPct: 50 });
  const totalRiders = result.plans.reduce((s, p) => s + p.riders, 0);
  assert.equal(totalRiders, 20);
  for (const plan of result.plans) {
    assert.ok(plan.riders <= plan.vehicle.capacity);
  }
  assert.ok(result.summary.vehiclesOverTargetCap > 0);
});
