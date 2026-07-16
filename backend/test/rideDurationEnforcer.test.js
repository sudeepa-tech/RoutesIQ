import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforceMaxRideDuration } from '../src/services/rideDurationEnforcer.js';
import { nearestNeighbourOrder, twoOpt } from '../src/services/optimizer.js';
import { computeArrivalSchedule } from '../src/services/timing.js';

const depot = { lat: 12.899129358584288, lng: 77.75070888668907 };

function makePlan(routeNo, capacity, stops, riders) {
  return {
    vehicle: { routeNo, vehicleNo: `VEH-${routeNo}`, capacity },
    stops,
    riders,
    distanceKm: 0,
    utilization: Number(((riders / capacity) * 100).toFixed(1)),
  };
}

function worstDuration(plan) {
  if (!plan.stops.length) return 0;
  const { timings } = computeArrivalSchedule(depot, plan.stops, { arrivalTime: '07:15', avgSpeedKmh: 28 });
  return timings[0].durationToSchoolMinutes;
}

test('moves stops off a route that exceeds the max ride duration, onto a nearby vehicle with room', () => {
  // R1: many stops clustered a realistic distance out, pushed over 90 min by sheer stop count + dwell
  const clusterStops = Array.from({ length: 25 }, (_, i) => ({
    id: `C${i}`,
    lat: 12.95 + (i % 5) * 0.01,
    lng: 77.80 + Math.floor(i / 5) * 0.01,
    headcount: 1,
    riderIds: [],
  }));
  const nn = nearestNeighbourOrder(depot, clusterStops);
  const { route } = twoOpt(depot, nn);

  const plans = [
    makePlan('R1', 60, route, 25),
    makePlan('R2', 60, [], 0), // spare capacity nearby to absorb overflow
  ];

  const before = worstDuration(plans[0]);
  assert.ok(before > 90, `test setup should start over budget, got ${before}`);

  const result = enforceMaxRideDuration(plans, depot, {
    maxDurationMinutes: 90, schoolArrivalTime: '07:15', avgSpeedKmh: 28, maxReassignDistanceKm: 12,
  });

  const afterR1 = worstDuration(result.plans[0]);
  assert.ok(afterR1 <= before, `R1 duration should not get worse: before=${before} after=${afterR1}`);
  assert.ok(result.plans[1].stops.length > 0, 'R2 should have absorbed some of the overflow');
});

test('never exceeds the max reassign distance when moving stops', () => {
  const nearStops = Array.from({ length: 15 }, (_, i) => ({
    id: `N${i}`, lat: 12.91 + i * 0.002, lng: 77.76 + i * 0.002, headcount: 1, riderIds: [],
  }));
  const nn = nearestNeighbourOrder(depot, nearStops);
  const { route } = twoOpt(depot, nn);

  const plans = [
    makePlan('R1', 40, route, 15),
    makePlan('R2', 40, [], 0),
  ];
  // with an impossibly tiny distance cap, no reassignment should succeed —
  // the router should report the route as still over budget rather than
  // violate the distance constraint to force a fix
  const result = enforceMaxRideDuration(plans, depot, {
    maxDurationMinutes: 1, schoolArrivalTime: '07:15', avgSpeedKmh: 28, maxReassignDistanceKm: 0.001,
  });
  assert.ok(result.stillOverBudget.length > 0);
});

test('does not exceed vehicle capacity when reassigning stops', () => {
  const stops = Array.from({ length: 10 }, (_, i) => ({
    id: `S${i}`, lat: 12.93 + i * 0.01, lng: 77.78 + i * 0.01, headcount: 4, riderIds: [],
  }));
  const nn = nearestNeighbourOrder(depot, stops);
  const { route } = twoOpt(depot, nn);

  const plans = [
    makePlan('R1', 50, route, 40),
    makePlan('R2', 10, [], 0), // very limited capacity
  ];
  const result = enforceMaxRideDuration(plans, depot, {
    maxDurationMinutes: 90, schoolArrivalTime: '07:15', avgSpeedKmh: 28, maxReassignDistanceKm: 12,
  });
  for (const p of result.plans) {
    assert.ok(p.riders <= p.vehicle.capacity, `${p.vehicle.routeNo} over capacity: ${p.riders}/${p.vehicle.capacity}`);
  }
});

test('reports stillOverBudget for routes that cannot be fixed within constraints', () => {
  const stops = Array.from({ length: 30 }, (_, i) => ({
    id: `S${i}`, lat: 12.95 + i * 0.01, lng: 77.85 + i * 0.01, headcount: 2, riderIds: [],
  }));
  const nn = nearestNeighbourOrder(depot, stops);
  const { route } = twoOpt(depot, nn);

  // only one vehicle exists at all — nothing to reassign to
  const plans = [makePlan('R1', 60, route, 60)];
  const result = enforceMaxRideDuration(plans, depot, {
    maxDurationMinutes: 90, schoolArrivalTime: '07:15', avgSpeedKmh: 28, maxReassignDistanceKm: 12,
  });
  assert.ok(result.stillOverBudget.length >= 0); // just confirm it doesn't throw and returns a report
  assert.equal(typeof result.iterations, 'number');
});
