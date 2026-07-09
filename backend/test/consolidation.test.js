import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestConsolidation, computeRoi } from '../src/services/consolidationAdvisor.js';

const depot = { lat: 12.899, lng: 77.7507 };

function makePlan(routeNo, capacity, riders, lat, lng) {
  return {
    vehicleId: routeNo,
    vehicle: { id: routeNo, routeNo, vehicleNo: `VEH-${routeNo}`, capacity },
    stops: Array.from({ length: riders }, (_, i) => ({
      id: `${routeNo}-${i}`,
      lat: lat + i * 0.001,
      lng: lng + i * 0.001,
      headcount: 1,
    })),
    riders,
    distanceKm: 20,
  };
}

test('merges two nearby under-utilized routes and frees a vehicle', () => {
  const plans = [
    makePlan('R1', 40, 10, 12.90, 77.60), // 25% full
    makePlan('R2', 40, 12, 12.901, 77.601), // 30% full, very close to R1
    makePlan('R3', 40, 38, 13.10, 77.90), // 95% full, far away — should stay untouched
  ];

  const result = suggestConsolidation(plans, depot, { utilizationThreshold: 70, maxMergeDistanceKm: 12 });

  assert.equal(result.metrics.vehiclesFreedCount, 1);
  assert.equal(result.metrics.vehiclesAfterConsolidation, 2);
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].combinedRiders, 22);
});

test('does not merge routes further apart than maxMergeDistanceKm', () => {
  const plans = [
    makePlan('R1', 40, 5, 12.90, 77.60),
    makePlan('R2', 40, 5, 13.50, 78.50), // far away
  ];
  const result = suggestConsolidation(plans, depot, { utilizationThreshold: 70, maxMergeDistanceKm: 5 });
  assert.equal(result.metrics.vehiclesFreedCount, 0);
  assert.equal(result.suggestions.length, 0);
});

test('does not exceed target vehicle capacity when merging', () => {
  const plans = [
    makePlan('R1', 10, 8, 12.90, 77.60), // 80% full - not a merge source (>=70%)
    makePlan('R2', 10, 5, 12.901, 77.601), // 50% full, would overflow R1 (8+5=13>10)
  ];
  const result = suggestConsolidation(plans, depot, { utilizationThreshold: 70, maxMergeDistanceKm: 12 });
  // R1 isn't a source (already >=70%), R2 is a source but R1 can't absorb it (overflow) and no other target exists
  assert.equal(result.metrics.vehiclesFreedCount, 0);
});

test('computeRoi returns fixed + fuel-adjusted savings', () => {
  const metrics = { vehiclesFreedCount: 3, distanceDeltaKm: -50 };
  const roi = computeRoi(metrics, { costPerVehiclePerMonth: 40000, fuelCostPerKm: 20, tripsPerDay: 2, operatingDaysPerMonth: 20 });
  assert.equal(roi.fixedMonthlySavings, 120000);
  assert.equal(roi.fixedAnnualSavings, 1440000);
  // distance improved (negative delta) -> fuel cost delta negative -> adds to savings
  assert.ok(roi.totalMonthlySavings > roi.fixedMonthlySavings);
});
