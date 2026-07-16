import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestConsolidation, computeRoi } from '../src/services/consolidationAdvisor.js';
import { computeArrivalSchedule } from '../src/services/timing.js';

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
  const result = suggestConsolidation(plans, depot, { utilizationThreshold: 70, maxMergeDistanceKm: 12, minCombinedUtilization: 90, maxRideDurationMinutes: 100000 });
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

test('pass 2 mops up a route that could not reach the full-load band, landing it above the threshold instead of leaving it under', () => {
  const plans = [
    // R1: 60% full — alone this can't reach 90%+ with any single nearby
    // partner without overflowing, but pass 2 should still get it >=70%
    makeTightPlan('R1', 50, 30, 12.90, 77.60),
    // R2: 20% full, nearby — 30+10=40 -> 80% combined, below the 90%
    // full-load band but comfortably above the 70% threshold
    makeTightPlan('R2', 50, 10, 12.9001, 77.6001),
  ];
  const result = suggestConsolidation(plans, depot, {
    utilizationThreshold: 70, maxMergeDistanceKm: 12, minCombinedUtilization: 90,
  });
  // pass 1 alone would find nothing (40/50=80% < 90% band), pass 2 should merge them at 80%
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].combinedUtilizationPct, 80);
  assert.equal(result.metrics.vehiclesStillUnderThreshold.length, 0);
});

test('reports remaining under-threshold vehicles when truly no merge is geographically feasible', () => {
  const plans = [
    makeTightPlan('R1', 50, 15, 12.90, 77.60), // 30% full, isolated
    makeTightPlan('R2', 50, 40, 20.0, 85.0), // far away, 80% full already (not a source)
  ];
  const result = suggestConsolidation(plans, depot, {
    utilizationThreshold: 70, maxMergeDistanceKm: 10, minCombinedUtilization: 90,
  });
  assert.equal(result.suggestions.length, 0);
  assert.equal(result.metrics.vehiclesStillUnderThreshold.length, 1);
  assert.equal(result.metrics.vehiclesStillUnderThreshold[0].routeNo, 'R1');
});

test('pass 2 never merges beyond maxMergeDistanceKm even when relaxing the utilization target', () => {
  const plans = [
    // R1 and R2 are ~13km apart — just outside a 12km cap — both under 70%
    makeTightPlan('R1', 50, 20, 12.90, 77.60), // 40% full
    makeTightPlan('R2', 50, 15, 13.02, 77.60), // 30% full, ~13.3km north of R1
  ];
  const result = suggestConsolidation(plans, depot, {
    utilizationThreshold: 70, maxMergeDistanceKm: 12, minCombinedUtilization: 90,
  });
  assert.equal(result.suggestions.length, 0);
  assert.equal(result.metrics.vehiclesStillUnderThreshold.length, 2);
});

test('never proposes a merge that would push any pickup earlier than the ride-duration cap allows', () => {
  const depotNear = { lat: 12.899129358584288, lng: 77.75070888668907 };
  // realistic aggregated stops (several riders per stop, like real apartment
  // complexes), spread a meaningful distance from campus
  function makeRealisticPlan(routeNo, capacity, stopCount, riders, baseLat, baseLng) {
    const perStop = Math.ceil(riders / stopCount);
    let remaining = riders;
    const stops = [];
    for (let i = 0; i < stopCount; i++) {
      const headcount = Math.min(perStop, remaining);
      stops.push({ id: `${routeNo}-${i}`, lat: baseLat + i * 0.01, lng: baseLng + i * 0.01, headcount });
      remaining -= headcount;
    }
    return {
      vehicleId: routeNo,
      vehicle: { id: routeNo, routeNo, vehicleNo: `VEH-${routeNo}`, capacity },
      stops,
      riders,
      distanceKm: 20,
    };
  }

  const plans = [
    makeRealisticPlan('R1', 60, 8, 25, 12.95, 77.85), // 42% full, ~15km out, 8 real stops
    makeRealisticPlan('R2', 60, 8, 20, 12.951, 77.851), // 33% full, right next to R1
  ];

  const tightBudget = 60; // deliberately tight — a naive merge would likely violate it
  const result = suggestConsolidation(plans, depotNear, {
    utilizationThreshold: 70, maxMergeDistanceKm: 12, minCombinedUtilization: 90,
    schoolArrivalTime: '07:15', avgSpeedKmh: 28, maxRideDurationMinutes: tightBudget,
  });

  // whether or not a merge happened, any that DID must respect the cap
  for (const s of result.suggestions) {
    const { timings } = computeArrivalSchedule(depotNear, s.orderedStops, { arrivalTime: '07:15', avgSpeedKmh: 28 });
    assert.ok(timings[0].durationToSchoolMinutes <= tightBudget,
      `merged route duration ${timings[0].durationToSchoolMinutes} exceeds the ${tightBudget}min cap`);
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
