import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractOrphanStops, suggestNewRoutes } from '../src/services/newRouteSuggester.js';
import { nearestNeighbourOrder, twoOpt } from '../src/services/optimizer.js';
import { computeArrivalSchedule } from '../src/services/timing.js';

const depot = { lat: 12.899129358584288, lng: 77.75070888668907 };

function makePlan(routeNo, capacity, stops) {
  const nn = nearestNeighbourOrder(depot, stops);
  const { route, distance } = twoOpt(depot, nn);
  return {
    vehicle: { routeNo, vehicleNo: `VEH-${routeNo}`, capacity },
    stops: route,
    riders: route.reduce((s, st) => s + st.headcount, 0),
    distanceKm: distance,
    utilization: 0,
  };
}

test('extractOrphanStops makes every remaining route compliant', () => {
  // a route far enough out that it violates a tight 60-minute cap
  const farStops = Array.from({ length: 15 }, (_, i) => ({
    id: `F${i}`, lat: 12.95 + i * 0.015, lng: 77.85 + i * 0.015, headcount: 2, riderIds: [],
  }));
  const plans = [makePlan('R1', 60, farStops)];

  const orphans = extractOrphanStops(plans, depot, { maxDurationMinutes: 60, schoolArrivalTime: '07:15', avgSpeedKmh: 28 });

  assert.ok(orphans.length > 0, 'should have extracted at least one orphan stop');
  // the remaining route must now be compliant
  if (plans[0].stops.length) {
    const { timings } = computeArrivalSchedule(depot, plans[0].stops, { arrivalTime: '07:15', avgSpeedKmh: 28 });
    assert.ok(timings[0].durationToSchoolMinutes <= 60);
  }
});

test('extractOrphanStops leaves an already-compliant route untouched', () => {
  const nearStops = Array.from({ length: 5 }, (_, i) => ({
    id: `N${i}`, lat: 12.90 + i * 0.005, lng: 77.76 + i * 0.005, headcount: 2, riderIds: [],
  }));
  const plans = [makePlan('R1', 40, nearStops)];
  const originalCount = plans[0].stops.length;

  const orphans = extractOrphanStops(plans, depot, { maxDurationMinutes: 90, schoolArrivalTime: '07:15', avgSpeedKmh: 28 });

  assert.equal(orphans.length, 0);
  assert.equal(plans[0].stops.length, originalCount);
});

test('suggestNewRoutes clusters orphans into capacity-sized new routes', () => {
  const orphanStops = Array.from({ length: 50 }, (_, i) => ({
    id: `O${i}`, lat: 12.95 + (i % 10) * 0.01, lng: 77.85 + Math.floor(i / 10) * 0.01, headcount: 1, riderIds: [],
  }));

  const newRoutes = suggestNewRoutes(orphanStops, depot, {
    newVehicleCapacity: 20, schoolArrivalTime: '07:15', avgSpeedKmh: 28, maxDurationMinutes: 90,
  });

  const totalRiders = newRoutes.reduce((s, r) => s + r.riders, 0);
  assert.equal(totalRiders, 50);
  for (const r of newRoutes) {
    assert.ok(r.riders <= 20, `route ${r.suggestedRouteNo} exceeds capacity: ${r.riders}`);
  }
  // ceil(50/20) = 3 routes minimum
  assert.ok(newRoutes.length >= 3);
});

test('suggestNewRoutes flags routes that cannot meet the constraint even as a dedicated bus', () => {
  // a single stop extremely far from campus — no vehicle, however dedicated, fits it under a tiny cap
  const orphanStops = [{ id: 'X1', lat: 13.5, lng: 78.5, headcount: 5, riderIds: [] }];
  const newRoutes = suggestNewRoutes(orphanStops, depot, {
    newVehicleCapacity: 40, schoolArrivalTime: '07:15', avgSpeedKmh: 28, maxDurationMinutes: 10,
  });
  assert.equal(newRoutes.length, 1);
  assert.equal(newRoutes[0].meetsConstraint, false);
});

test('suggestNewRoutes never exceeds the assumed new-vehicle capacity per route', () => {
  const orphanStops = Array.from({ length: 30 }, (_, i) => ({
    id: `C${i}`, lat: 12.92, lng: 77.80, headcount: 3, riderIds: [], // all at the same point
  }));
  const newRoutes = suggestNewRoutes(orphanStops, depot, {
    newVehicleCapacity: 25, schoolArrivalTime: '07:15', avgSpeedKmh: 28, maxDurationMinutes: 90,
  });
  for (const r of newRoutes) {
    assert.ok(r.riders <= 25);
  }
});
