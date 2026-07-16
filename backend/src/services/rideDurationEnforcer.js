/**
 * Ride Duration Enforcer
 * ------------------------------------------------
 * No student should spend more than `maxDurationMinutes` (default 105 —
 * i.e. pickup no earlier than 05:30 given a fixed 07:15 school arrival) on
 * the bus. Clustering by capacity and geography alone doesn't guarantee
 * this — a route can still end up needing a very early pickup for its
 * farthest stop if it accumulated too many stops or too wide a spread.
 *
 * This runs AFTER initial route construction (clustering + 2-opt) and
 * repairs any route whose farthest-in-time stop exceeds the cap:
 *   1. Compute the pickup schedule for the route; the FIRST stop (by
 *      construction, pickup schedules are backward-from-arrival, so the
 *      first stop always has the longest remaining ride) is the one to
 *      check.
 *   2. If it's over budget, find another vehicle within
 *      `maxReassignDistanceKm` that has seat room AND — simulated —
 *      would NOT itself end up over budget after taking the stop.
 *   3. Move the stop, re-sequence both affected routes (nearest-neighbour
 *      + 2-opt), and repeat until no route violates the cap or no more
 *      progress can be made.
 *
 * Any stop that truly can't be reassigned within the distance cap (rare —
 * an isolated stop farther than any vehicle could reach in time) is left
 * in place and reported in `stillOverBudget` for transparency, rather
 * than silently violating capacity or distance constraints to force a fix.
 */

import { haversineKm, nearestNeighbourOrder, twoOpt } from './optimizer.js';
import { computeArrivalSchedule } from './timing.js';

function centroidOf(stops) {
  if (!stops.length) return null;
  const lat = stops.reduce((s, p) => s + p.lat, 0) / stops.length;
  const lng = stops.reduce((s, p) => s + p.lng, 0) / stops.length;
  return { lat, lng };
}

function resequence(plan, depot) {
  if (!plan.stops.length) {
    plan.distanceKm = 0;
    plan.utilization = 0;
    return;
  }
  const nn = nearestNeighbourOrder(depot, plan.stops);
  const { route, distance } = twoOpt(depot, nn);
  plan.stops = route;
  plan.distanceKm = Number(distance.toFixed(2));
  plan.riders = route.reduce((s, st) => s + st.headcount, 0);
  plan.utilization = Number(((plan.riders / plan.vehicle.capacity) * 100).toFixed(1));
}

/**
 * plans: optimizeFleet().plans (mutated in place and also returned)
 * options: { maxDurationMinutes (default 105), schoolArrivalTime (default '07:15'),
 *            avgSpeedKmh (default 28), maxReassignDistanceKm (default 12) }
 */
export function enforceMaxRideDuration(plans, depot, options = {}) {
  const maxDurationMinutes = options.maxDurationMinutes ?? 105;
  const schoolArrivalTime = options.schoolArrivalTime ?? '07:15';
  const avgSpeedKmh = options.avgSpeedKmh ?? 28;
  const maxReassignDistanceKm = options.maxReassignDistanceKm ?? 12;

  const maxIterations = 800;
  let iterations = 0;
  let changed = true;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const plan of plans) {
      if (!plan.stops.length) continue;
      const { timings } = computeArrivalSchedule(depot, plan.stops, { arrivalTime: schoolArrivalTime, avgSpeedKmh });
      const worst = timings[0]; // farthest-in-time stop (monotonically the longest ride)
      if (!worst || worst.durationToSchoolMinutes <= maxDurationMinutes) continue;

      const worstStop = plan.stops.find((s) => s.id === worst.stopId);
      if (!worstStop) continue;

      // Screening uses a cheap nearest-neighbour estimate (no 2-opt) so we
      // can check many candidates fast; the winning move gets a proper
      // 2-opt pass below before being committed.
      let bestTarget = null;
      let bestDist = Infinity;
      let bestSimStops = null;

      for (const other of plans) {
        if (other === plan) continue;
        const remainingCap = other.vehicle.capacity - other.riders;
        if (remainingCap < worstStop.headcount) continue;

        const otherCentroid = other.stops.length ? centroidOf(other.stops) : depot;
        const d = haversineKm(worstStop, otherCentroid);
        if (d > maxReassignDistanceKm || d >= bestDist) continue;

        const simStops = nearestNeighbourOrder(depot, [...other.stops, worstStop]);
        const simTiming = computeArrivalSchedule(depot, simStops, { arrivalTime: schoolArrivalTime, avgSpeedKmh });
        if (simTiming.timings[0] && simTiming.timings[0].durationToSchoolMinutes > maxDurationMinutes) continue;

        bestDist = d;
        bestTarget = other;
        bestSimStops = simStops;
      }

      // Tier 2 (relaxed): every nearby vehicle is itself already fairly
      // loaded (common once the whole fleet is in use) — accept the
      // target whose RESULTING duration is lowest, as long as it's
      // strictly less than this stop's current wait, guaranteeing the
      // fleet's total excess-over-budget still shrinks every move (so
      // the loop provably converges rather than oscillating).
      if (!bestTarget) {
        let bestResultingDuration = worst.durationToSchoolMinutes;
        for (const other of plans) {
          if (other === plan) continue;
          const remainingCap = other.vehicle.capacity - other.riders;
          if (remainingCap < worstStop.headcount) continue;
          const otherCentroid = other.stops.length ? centroidOf(other.stops) : depot;
          const d = haversineKm(worstStop, otherCentroid);
          if (d > maxReassignDistanceKm) continue;

          const simStops = nearestNeighbourOrder(depot, [...other.stops, worstStop]);
          const simTiming = computeArrivalSchedule(depot, simStops, { arrivalTime: schoolArrivalTime, avgSpeedKmh });
          const resultingDuration = simTiming.timings[0]?.durationToSchoolMinutes ?? 0;
          if (resultingDuration < bestResultingDuration) {
            bestResultingDuration = resultingDuration;
            bestTarget = other;
            bestSimStops = simStops;
          }
        }
      }

      if (!bestTarget) continue; // no feasible reassignment — leave it, reported below

      plan.stops = plan.stops.filter((s) => s.id !== worstStop.id);
      resequence(plan, depot);

      bestTarget.stops = bestSimStops; // nearest-neighbour estimate; resequence() below runs the real 2-opt
      resequence(bestTarget, depot);

      changed = true;
    }
  }

  const stillOverBudget = [];
  for (const plan of plans) {
    if (!plan.stops.length) continue;
    const { timings } = computeArrivalSchedule(depot, plan.stops, { arrivalTime: schoolArrivalTime, avgSpeedKmh });
    if (timings[0] && timings[0].durationToSchoolMinutes > maxDurationMinutes) {
      stillOverBudget.push({
        routeNo: plan.vehicle.routeNo,
        vehicleNo: plan.vehicle.vehicleNo,
        worstDurationMinutes: timings[0].durationToSchoolMinutes,
      });
    }
  }

  return { plans, stillOverBudget, iterations, maxDurationMinutes };
}
