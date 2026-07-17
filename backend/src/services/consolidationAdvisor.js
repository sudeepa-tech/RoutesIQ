/**
 * Consolidation Advisor
 * ------------------------------------------------
 * Takes an already-optimized fleet plan (see optimizer.js) and looks for
 * opportunities to GROUP under-utilized routes together onto a single
 * vehicle so fewer vehicles are needed overall — the "70% + 30% = one
 * full bus" idea, generalized to N routes when a single pairwise merge
 * can't reach a truly full load.
 *
 * Heuristic (greedy nearest-centroid grouping, TWO passes):
 *   Pass 1 (full-load): sort routes by utilization ascending. Seed a group
 *     with the emptiest route, repeatedly pull in the geographically
 *     closest still-active route (within `maxMergeDistanceKm`) whose
 *     riders still fit in the largest-capacity vehicle seen in the group
 *     so far, until the combined load lands in the "near-full" band
 *     (>= `minCombinedUtilization`, default 90%, and <= 100%).
 *   Pass 2 (mop-up): any route STILL below `utilizationThreshold` (default
 *     70%) after pass 1 — because it had no full-load-band combination
 *     nearby — gets a second, more lenient attempt: same grouping logic
 *     and the SAME distance cap (`maxMergeDistanceKm` is a hard ceiling,
 *     never widened), but only requiring the combined load reach
 *     `utilizationThreshold` (not the full 90%+ band). This means "no
 *     vehicle left under 70% if a geographically reasonable (<= the
 *     configured distance cap) merge exists" — pass 1 prefers truly full
 *     buses, pass 2 makes sure nothing is left badly under-utilized just
 *     because it couldn't reach "full", without ever merging routes
 *     farther apart than the configured cap.
 *
 * Every accepted merge keeps the group's largest-capacity vehicle as the
 * survivor, re-sequences its stops (nearest-neighbour + 2-opt) over ALL
 * the group's stops, and releases every other vehicle in the group.
 *
 * This is a heuristic, not a guaranteed-optimal bin packing — but it's
 * fast, explainable, and respects geography.
 */

import { haversineKm, nearestNeighbourOrder, twoOpt } from './optimizer.js';
import { computeArrivalSchedule } from './timing.js';

function centroidOf(stops) {
  if (!stops.length) return null;
  const lat = stops.reduce((s, p) => s + p.lat, 0) / stops.length;
  const lng = stops.reduce((s, p) => s + p.lng, 0) / stops.length;
  return { lat, lng };
}

/**
 * Runs one grouping pass over `active` routes, mutating it in place
 * (marking merged-away routes `released`) and pushing accepted merges
 * into `suggestions`. Routes that can't reach `bandTarget` within
 * `distanceLimit` are added to `givenUp` so they aren't retried forever
 * within this pass (a later pass with different parameters can still
 * retry them, since `givenUp` is passed in fresh per call).
 */
function runMergePass({ active, depot, utilizationThreshold, bandTarget, distanceLimit, suggestions, givenUp, schoolArrivalTime, avgSpeedKmh, maxRideDurationMinutes }) {
  let progress = true;
  while (progress) {
    progress = false;

    const sources = active
      .filter((r) => !r.released && !givenUp.has(r.routeNo))
      .filter((r) => (r.riders / r.vehicle.capacity) * 100 < utilizationThreshold)
      .sort((a, b) => a.riders / a.vehicle.capacity - b.riders / b.vehicle.capacity);

    if (!sources.length) break;
    const seed = sources[0];

    const group = [seed];
    let groupRiders = seed.riders;
    const survivorCapacity = () => Math.max(...group.map((r) => r.vehicle.capacity));

    while ((groupRiders / survivorCapacity()) * 100 < bandTarget) {
      const centroid = centroidOf(group.flatMap((r) => r.stops));
      let best = null;
      let bestDist = Infinity;
      for (const cand of active) {
        if (cand.released || group.includes(cand)) continue;
        const newRiders = groupRiders + cand.riders;
        const newCapacity = Math.max(survivorCapacity(), cand.vehicle.capacity);
        if (newRiders > newCapacity) continue;
        const d = haversineKm(centroid, centroidOf(cand.stops));
        if (d > distanceLimit || d >= bestDist) continue;

        // don't grow the group past the pickup-time floor — merging must
        // never push a student's pickup earlier than the fleet-wide cap
        const simStops = nearestNeighbourOrder(depot, [...group.flatMap((r) => r.stops), ...cand.stops]);
        const simTiming = computeArrivalSchedule(depot, simStops, { arrivalTime: schoolArrivalTime, avgSpeedKmh });
        if (simTiming.timings[0] && simTiming.timings[0].durationToSchoolMinutes > maxRideDurationMinutes) continue;

        bestDist = d;
        best = cand;
      }
      if (!best) break;
      group.push(best);
      groupRiders += best.riders;
    }

    const finalUtil = (groupRiders / survivorCapacity()) * 100;

    if (group.length > 1 && finalUtil >= bandTarget && finalUtil <= 100 + 1e-6) {
      const survivor = group.reduce((a, b) => (a.vehicle.capacity >= b.vehicle.capacity ? a : b));
      const others = group.filter((r) => r !== survivor);
      const combinedStops = group.flatMap((r) => r.stops.map((s) => ({ ...s, originRouteNo: r.routeNo })));
      const nn = nearestNeighbourOrder(depot, combinedStops);
      const { route, distance } = twoOpt(depot, nn);

      // final safety check: 2-opt only ever shortens the route, so this
      // should already hold given the growth-time checks above, but
      // verify before committing rather than assume
      const finalTiming = computeArrivalSchedule(depot, route, { arrivalTime: schoolArrivalTime, avgSpeedKmh });
      if (finalTiming.timings[0] && finalTiming.timings[0].durationToSchoolMinutes > maxRideDurationMinutes) {
        givenUp.add(seed.routeNo);
        progress = true;
        continue;
      }

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
        orderedStops: route,
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
      givenUp.add(seed.routeNo);
      progress = true;
    }
  }
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
  const schoolArrivalTime = options.schoolArrivalTime ?? '07:15';
  const avgSpeedKmh = options.avgSpeedKmh ?? 28;
  const maxRideDurationMinutes = options.maxRideDurationMinutes ?? 165;

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

  // Pass 1: chase the full-load band
  runMergePass({
    active, depot, utilizationThreshold, bandTarget: minCombinedUtilization,
    distanceLimit: maxMergeDistanceKm, suggestions, givenUp: new Set(),
    schoolArrivalTime, avgSpeedKmh, maxRideDurationMinutes,
  });

  // Pass 2: mop up anything still under the threshold with a relaxed
  // target — but the SAME hard distance cap. "Merge will not happen
  // more than maxMergeDistanceKm apart" is a hard constraint, not a
  // suggestion, so pass 2 never searches farther than pass 1 did.
  runMergePass({
    active, depot, utilizationThreshold, bandTarget: utilizationThreshold,
    distanceLimit: maxMergeDistanceKm, suggestions, givenUp: new Set(),
    schoolArrivalTime, avgSpeedKmh, maxRideDurationMinutes,
  });

  const releasedVehicles = active.filter((r) => r.released);
  const remainingRoutes = active.filter((r) => !r.released);
  const newTotalDistance = remainingRoutes.reduce((s, r) => s + r.distanceKm, 0);
  const stillUnderThreshold = remainingRoutes.filter(
    (r) => (r.riders / r.vehicle.capacity) * 100 < utilizationThreshold
  );

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
      vehiclesStillUnderThreshold: stillUnderThreshold.map((r) => ({
        routeNo: r.routeNo,
        vehicleNo: r.vehicle.vehicleNo,
        utilizationPct: Number(((r.riders / r.vehicle.capacity) * 100).toFixed(1)),
      })),
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
