import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestConsolidation, computeRoi } from '../src/services/consolidationAdvisor.js';

const depot = { lat: 12.899, lng: 77.7507 };

function makeTightPlan(routeNo, capacity, riders, lat, lng) {
  // all riders share (near-)identical coordinates so the route's centroid
  // is precisely (lat,lng), making distance comparisons deterministic
  return {
    vehicleId: routeNo,
    vehicle: { id: routeNo, routeNo, vehicleNo: `VEH-${routeNo}`, capacity },
    stops: Array.from({ length: riders }, (_, i) => ({
      id: `${routeNo}-${i}`,
      lat: lat + i * 0.00001,
      lng: lng + i * 0.00001,
      headcount: 1,
    })),
    riders,
    distanceKm: 20,
  };
}

test('merges two nearby under-utilized routes into a full-load group', () => {
  const plans = [
    makeTightPlan('R1', 40, 28, 12.90, 77.60), // 70% full
    makeTightPlan('R2', 40, 12, 12.9001, 77.6001), // 30% full, very close -> combined 100%
    makeTightPlan('R3', 40, 38, 13.10, 77.90), // 95% full, far away — should stay untouched
  ];

  const result = suggestConsolidation(plans, depot, { utilizationThreshold: 70, maxMergeDistanceKm: 12, minCombinedUtilization: 90 });

  assert.equal(result.metrics.vehiclesFreedCount, 1);
  assert.equal(result.metrics.vehiclesAfterConsolidation, 2);
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].combinedRiders, 40);
  assert.equal(result.suggestions[0].combinedUtilizationPct, 100);
});

test('does not merge routes further apart than maxMergeDistanceKm', () => {
  const plans = [
    makeTightPlan('R1', 40, 5, 12.90, 77.60),
    makeTightPlan('R2', 40, 5, 13.50, 78.50), // far away
  ];
  const result = suggestConsolidation(plans, depot, { utilizationThreshold: 70, maxMergeDistanceKm: 5, minCombinedUtilization: 90 });
  assert.equal(result.metrics.vehiclesFreedCount, 0);
  assert.equal(result.suggestions.length, 0);
});

test('pulls in a THIRD nearby route when two alone do not reach the full-load band', () => {
  const plans = [
    makeTightPlan('R1', 100, 40, 12.90, 77.60), // 40% full — seed
    makeTightPlan('R2', 100, 20, 12.9001, 77.6001), // 20% full, close — 40+20=60%, still short of 90%
    makeTightPlan('R3', 100, 35, 12.9002, 77.6002), // 35% full, close — 60+35=95%, within band
  ];
  const result = suggestConsolidation(plans, depot, { utilizationThreshold: 70, maxMergeDistanceKm: 12, minCombinedUtilization: 90 });
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].mergedRoutes.length, 3);
  assert.equal(result.suggestions[0].combinedRiders, 95);
  assert.equal(result.suggestions[0].combinedUtilizationPct, 95);
  assert.equal(result.metrics.vehiclesFreedCount, 2);
});

test('leaves a route alone if no combination nearby reaches the full-load band', () => {
  const plans = [
    makeTightPlan('R1', 100, 10, 12.90, 77.60), // 10% full, isolated
    makeTightPlan('R2', 100, 40, 13.50, 78.50), // far away, wouldn't help even if reachable
  ];
  const result = suggestConsolidation(plans, depot, { utilizationThreshold: 70, maxMergeDistanceKm: 5, minCombinedUtilization: 90 });
  assert.equal(result.suggestions.length, 0);
  assert.equal(result.metrics.vehiclesFreedCount, 0);
});

test('never exceeds 100% utilization on the surviving vehicle', () => {
  const plans = [
    makeTightPlan('R1', 40, 20, 12.90, 77.60),
    makeTightPlan('R2', 40, 25, 12.9001, 77.6001), // 20+25=45 > 40, cannot combine into either vehicle
  ];
  const result = suggestConsolidation(plans, depot, { utilizationThreshold: 70, maxMergeDistanceKm: 12, minCombinedUtilization: 90 });
  for (const s of result.suggestions) {
    assert.ok(s.combinedUtilizationPct <= 100);
  }
});

test('computeRoi returns fixed + fuel-adjusted savings', () => {
  const metrics = { vehiclesFreedCount: 3, distanceDeltaKm: -50 };
  const roi = computeRoi(metrics, { costPerVehiclePerMonth: 40000, fuelCostPerKm: 20, tripsPerDay: 2, operatingDaysPerMonth: 20 });
  assert.equal(roi.fixedMonthlySavings, 120000);
  assert.equal(roi.fixedAnnualSavings, 1440000);
  // distance improved (negative delta) -> fuel cost delta negative -> adds to savings
  assert.ok(roi.totalMonthlySavings > roi.fixedMonthlySavings);
});
