/**
 * Consolidation Advisor
 * ------------------------------------------------
 * Takes an already-optimized fleet plan (see optimizer.js) and looks for
 * opportunities to MERGE under-utilized routes together so fewer vehicles
 * are needed overall — the classic "70% + 30% = one full bus" idea.
 *
 * Heuristic (greedy bin-consolidation, nearest-centroid first):
 *   1. Sort routes by utilization, ascending (emptiest buses first).
 *   2. For the emptiest route, look at every OTHER still-active route whose
 *      remaining seats can absorb this route's riders.
 *   3. Among capacity-feasible candidates, pick the geographically closest
 *      one (by stop-centroid distance) within `maxMergeDistanceKm` — this
 *      keeps the merged route realistic instead of zig-zagging across the
 *      city just to fill seats.
 *   4. Merge: source route's stops move onto the target vehicle, the
 *      target's stop sequence is re-optimized (nearest-neighbour + 2-opt),
 *      and the source vehicle is marked "released" (no longer needed).
 *   5. Repeat until no more feasible, distance-bounded merges exist.
 *
 * This is a heuristic, not a guaranteed-optimal bin packing — but it's
 * fast, explainable, and respects geography, which a pure knapsack
 * solve on headcounts alone would not.
 */

import { haversineKm, nearestNeighbourOrder, twoOpt, routeDistance } from './optimizer.js';

function centroidOf(stops) {
  if (!stops.length) return null;
  const lat = stops.reduce((s, p) => s + p.lat, 0) / stops.length;
  const lng = stops.reduce((s, p) => s + p.lng, 0) / stops.length;
  return { lat, lng };
}

/**
 * plans: output of optimizeFleet().plans
 * options: { utilizationThreshold (default 70), maxMergeDistanceKm (default 12) }
 */
export function suggestConsolidation(plans, depot, options = {}) {
  const utilizationThreshold = options.utilizationThreshold ?? 70;
  const maxMergeDistanceKm = options.maxMergeDistanceKm ?? 12;

  // working copies we can mutate as merges happen
  const active = plans
    .filter((p) => p.stops.length > 0)
    .map((p) => ({
      routeNo: p.vehicle.routeNo,
      vehicleId: p.vehicleId,
      vehicle: p.vehicle,
      stops: [...p.stops],
      riders: p.riders,
      distanceKm: p.distanceKm,
      released: false,
    }));

  const suggestions = [];
  const originalTotalDistance = active.reduce((s, r) => s + r.distanceKm, 0);
  const originalVehicleCount = active.length;

  let changed = true;
  while (changed) {
    changed = false;

    // work on a fresh utilization-ascending pass each loop since merges
    // change utilizations
    const candidates = active
      .filter((r) => !r.released)
      .sort((a, b) => a.riders / a.vehicle.capacity - b.riders / b.vehicle.capacity);

    for (const source of candidates) {
      if (source.released) continue;
      const sourceUtil = (source.riders / source.vehicle.capacity) * 100;
      if (sourceUtil >= utilizationThreshold) continue; // already efficient, skip

      const sourceCentroid = centroidOf(source.stops);

      // find the best merge target: capacity-feasible + closest by centroid
      let best = null;
      let bestDist = Infinity;
      for (const target of active) {
        if (target.released || target === source) continue;
        const combinedRiders = target.riders + source.riders;
        if (combinedRiders > target.vehicle.capacity) continue;
        const targetCentroid = centroidOf(target.stops);
        const d = haversineKm(sourceCentroid, targetCentroid);
        if (d <= maxMergeDistanceKm && d < bestDist) {
          bestDist = d;
          best = target;
        }
      }

      if (!best) continue;

      // perform the merge: re-sequence target's route with the combined stops
      const combinedStops = [...best.stops, ...source.stops];
      const nn = nearestNeighbourOrder(depot, combinedStops);
      const { route, distance } = twoOpt(depot, nn);
      const newRiders = best.riders + source.riders;

      suggestions.push({
        action: 'merge',
        fromRoute: source.routeNo,
        fromVehicle: source.vehicle.vehicleNo,
        fromRiders: source.riders,
        fromUtilizationPct: Number(sourceUtil.toFixed(1)),
        intoRoute: best.routeNo,
        intoVehicle: best.vehicle.vehicleNo,
        centroidDistanceKm: Number(bestDist.toFixed(2)),
        combinedRiders: newRiders,
        combinedUtilizationPct: Number(((newRiders / best.vehicle.capacity) * 100).toFixed(1)),
        distanceBeforeKm: Number((best.distanceKm + source.distanceKm).toFixed(2)),
        distanceAfterKm: Number(distance.toFixed(2)),
        vehicleFreed: {
          vehicleNo: source.vehicle.vehicleNo,
          capacity: source.vehicle.capacity,
        },
      });

      // apply merge to working state
      best.stops = route;
      best.riders = newRiders;
      best.distanceKm = Number(distance.toFixed(2));
      source.released = true;
      source.stops = [];
      source.riders = 0;

      changed = true;
      break; // restart the pass since utilizations shifted
    }
  }

  const releasedVehicles = active.filter((r) => r.released);
  const remainingRoutes = active.filter((r) => !r.released);
  const newTotalDistance = remainingRoutes.reduce((s, r) => s + r.distanceKm, 0);

  return {
    suggestions,
    vehiclesFreed: releasedVehicles.map((r) => ({
      vehicleNo: r.vehicle.vehicleNo,
      routeNo: r.routeNo,
      capacity: r.vehicle.capacity,
    })),
    metrics: {
      originalVehicleCount,
      vehiclesAfterConsolidation: remainingRoutes.length,
      vehiclesFreedCount: releasedVehicles.length,
      originalTotalDistanceKm: Number(originalTotalDistance.toFixed(2)),
      newTotalDistanceKm: Number(newTotalDistance.toFixed(2)),
      distanceDeltaKm: Number((newTotalDistance - originalTotalDistance).toFixed(2)),
    },
  };
}

/**
 * Turns freed-vehicle counts into a rupee (or any currency) ROI estimate.
 * All financial inputs are caller-supplied assumptions — this module makes
 * no claim about real-world costs, it just does the arithmetic.
 */
export function computeRoi(metrics, assumptions = {}) {
  const costPerVehiclePerMonth = assumptions.costPerVehiclePerMonth ?? 45000;
  const fuelCostPerKm = assumptions.fuelCostPerKm ?? 18;
  const tripsPerDay = assumptions.tripsPerDay ?? 2; // pickup + drop
  const operatingDaysPerMonth = assumptions.operatingDaysPerMonth ?? 22;

  const fixedMonthlySavings = metrics.vehiclesFreedCount * costPerVehiclePerMonth;
  const fixedAnnualSavings = fixedMonthlySavings * 12;

  const distanceDeltaPerTripKm = metrics.distanceDeltaKm; // can be negative (worse) or positive (better)
  const dailyFuelDeltaCost = distanceDeltaPerTripKm * tripsPerDay * fuelCostPerKm;
  const monthlyFuelDeltaCost = dailyFuelDeltaCost * operatingDaysPerMonth;
  const annualFuelDeltaCost = monthlyFuelDeltaCost * 12;

  return {
    assumptions: {
      costPerVehiclePerMonth,
      fuelCostPerKm,
      tripsPerDay,
      operatingDaysPerMonth,
    },
    fixedMonthlySavings: Number(fixedMonthlySavings.toFixed(0)),
    fixedAnnualSavings: Number(fixedAnnualSavings.toFixed(0)),
    monthlyFuelDeltaCost: Number(monthlyFuelDeltaCost.toFixed(0)),
    annualFuelDeltaCost: Number(annualFuelDeltaCost.toFixed(0)),
    totalMonthlySavings: Number((fixedMonthlySavings - monthlyFuelDeltaCost).toFixed(0)),
    totalAnnualSavings: Number((fixedAnnualSavings - annualFuelDeltaCost).toFixed(0)),
  };
}
