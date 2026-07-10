/**
 * Consolidation Advisor
 * ------------------------------------------------
 * Takes an already-optimized fleet plan (see optimizer.js) and looks for
 * opportunities to GROUP under-utilized routes together onto a single
 * vehicle so fewer vehicles are needed overall — the "70% + 30% = one
 * full bus" idea, generalized to N routes when a single pairwise merge
 * can't reach a truly full load.
 *
 * Heuristic (greedy nearest-centroid grouping):
 *   1. Sort routes by utilization, ascending (emptiest buses first).
 *   2. Seed a group with the emptiest route. Repeatedly pull in the
 *      geographically closest still-active route (within
 *      `maxMergeDistanceKm` of the group's current centroid) whose riders
 *      still fit in the largest-capacity vehicle seen in the group so far.
 *   3. Stop growing the group once its combined utilization (against the
 *      largest vehicle in the group) lands in the "near-full" band —
 *      >= `minCombinedUtilization` (default 90%) and <= 100%.
 *   4. If the band is reached, keep the group's largest-capacity vehicle
 *      as the survivor, re-sequence its stops (nearest-neighbour + 2-opt)
 *      over ALL the group's stops, and release every other vehicle in the
 *      group. If the band can't be reached (no more nearby routes to add),
 *      the seed route is left alone and the next-emptiest route is tried.
 *
 * This is a heuristic, not a guaranteed-optimal bin packing — but it's
 * fast, explainable, respects geography, and — unlike a pure pairwise
 * merge — can actually land in a tight utilization band by pulling in a
 * third or fourth nearby route when two alone don't add up to "full".
 */

import { haversineKm, nearestNeighbourOrder, twoOpt } from './optimizer.js';

function centroidOf(stops) {
  if (!stops.length) return null;
  const lat = stops.reduce((s, p) => s + p.lat, 0) / stops.length;
  const lng = stops.reduce((s, p) => s + p.lng, 0) / stops.length;
  return { lat, lng };
}

/**
 * plans: output of optimizeFleet().plans
 * options: { utilizationThreshold (default 70), maxMergeDistanceKm (default 12),
 *            minCombinedUtilization (default 90) }
 */
export function suggestConsolidation(plans, depot, options = {}) {
  const utilizationThreshold = options.utilizationThreshold ?? 70;
  const maxMergeDistanceKm = options.maxMergeDistanceKm ?? 12;
  const minCombinedUtilization = options.minCombinedUtilization ?? 90;

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
  const givenUp = new Set(); // routeNos we've already tried and couldn't reach the band

  let progress = true;
  while (progress) {
    progress = false;

    const sources = active
      .filter((r) => !r.released && !givenUp.has(r.routeNo))
      .filter((r) => (r.riders / r.vehicle.capacity) * 100 < utilizationThreshold)
      .sort((a, b) => a.riders / a.vehicle.capacity - b.riders / b.vehicle.capacity);

    if (!sources.length) break;
    const seed = sources[0];

    // grow a group starting from the seed, pulling in the nearest feasible
    // route each step, until the combined load lands in the full-load band
    const group = [seed];
    let groupRiders = seed.riders;
    const survivorCapacity = () => Math.max(...group.map((r) => r.vehicle.capacity));

    while ((groupRiders / survivorCapacity()) * 100 < minCombinedUtilization) {
      const centroid = centroidOf(group.flatMap((r) => r.stops));
      let best = null;
      let bestDist = Infinity;
      for (const cand of active) {
        if (cand.released || group.includes(cand)) continue;
        const newRiders = groupRiders + cand.riders;
        const newCapacity = Math.max(survivorCapacity(), cand.vehicle.capacity);
        if (newRiders > newCapacity) continue; // wouldn't fit even in the bigger vehicle
        const d = haversineKm(centroid, centroidOf(cand.stops));
        if (d <= maxMergeDistanceKm && d < bestDist) {
          bestDist = d;
          best = cand;
        }
      }
      if (!best) break; // nothing nearby left that fits
      group.push(best);
      groupRiders += best.riders;
    }

    const finalUtil = (groupRiders / survivorCapacity()) * 100;

    if (group.length > 1 && finalUtil >= minCombinedUtilization && finalUtil <= 100 + 1e-6) {
      const survivor = group.reduce((a, b) => (a.vehicle.capacity >= b.vehicle.capacity ? a : b));
      const others = group.filter((r) => r !== survivor);
      // tag every stop with which route it originally belonged to, so
      // downstream reporting can tell "impacted" riders (moved to a new
      // vehicle) apart from the survivor's own original riders
      const combinedStops = group.flatMap((r) => r.stops.map((s) => ({ ...s, originRouteNo: r.routeNo })));
      const nn = nearestNeighbourOrder(depot, combinedStops);
      const { route, distance } = twoOpt(depot, nn);

      suggestions.push({
        mergedRoutes: group.map((r) => r.routeNo),
        intoRoute: survivor.routeNo,
        intoVehicle: survivor.vehicle.vehicleNo,
        freedVehicles: others.map((r) => ({
          routeNo: r.routeNo,
          vehicleNo: r.vehicle.vehicleNo,
          capacity: r.vehicle.capacity,
          priorUtilizationPct: Number(((r.riders / r.vehicle.capacity) * 100).toFixed(1)),
        })),
        combinedRiders: groupRiders,
        combinedUtilizationPct: Number(finalUtil.toFixed(1)),
        distanceBeforeKm: Number(group.reduce((s, r) => s + r.distanceKm, 0).toFixed(2)),
        distanceAfterKm: Number(distance.toFixed(2)),
        orderedStops: route, // final sequenced stops on the survivor, each tagged with originRouteNo
      });

      survivor.stops = route;
      survivor.riders = groupRiders;
      survivor.distanceKm = Number(distance.toFixed(2));
      for (const o of others) {
        o.released = true;
        o.stops = [];
        o.riders = 0;
      }
      progress = true;
    } else {
      // couldn't reach the full-load band with what's nearby — leave this
      // route as-is and try the next-emptiest one instead
      givenUp.add(seed.routeNo);
      progress = true;
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

  const distanceDeltaPerTripKm = metrics.distanceDeltaKm; // can be negative (better) or positive (worse)
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
