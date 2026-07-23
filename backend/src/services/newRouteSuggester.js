/**
 * New Route Suggester
 * ------------------------------------------------
 * After the ride-duration enforcer has done its best to reshuffle stops
 * between EXISTING vehicles, some stops may still be un-placeable within
 * the time constraint (no nearby vehicle has room, or every nearby
 * vehicle would also end up over budget). Rather than silently leaving
 * those routes non-compliant, this module:
 *
 *   1. `extractOrphanStops` — walks every still-over-budget route and
 *      strips its worst (farthest-in-time) stops one at a time until the
 *      route is compliant, collecting the stripped stops into an "orphan
 *      pool". The source route is re-sequenced and its rider/distance
 *      numbers updated to reflect the removal.
 *   2. `suggestNewRoutes` — clusters the orphan pool into one or more
 *      brand-new route proposals (assuming a standard new-vehicle
 *      capacity), sequences each with nearest-neighbour + 2-opt, and
 *      computes its pickup schedule. If even a dedicated new bus can't
 *      bring a stop into compliance (it's simply too far out), that is
 *      reported via `meetsConstraint: false` rather than hidden.
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
    plan.riders = 0;
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
 * Mutates `plans` in place: strips non-compliant stops off any route
 * whose farthest stop still exceeds maxDurationMinutes, until every
 * remaining route is compliant. Returns the stripped stops.
 */
export function extractOrphanStops(plans, depot, { maxDurationMinutes, schoolArrivalTime, avgSpeedKmh }) {
  const orphanStops = [];

  for (const plan of plans) {
    let guard = 0;
    while (plan.stops.length && guard < 200) {
      guard++;
      const { timings } = computeArrivalSchedule(depot, plan.stops, { arrivalTime: schoolArrivalTime, avgSpeedKmh });
      const worst = timings[0];
      if (!worst || worst.durationToSchoolMinutes <= maxDurationMinutes) break;

      const worstStop = plan.stops.find((s) => s.id === worst.stopId);
      if (!worstStop) break;

      orphanStops.push({ ...worstStop, originRouteNo: plan.vehicle.routeNo, originVehicleNo: plan.vehicle.vehicleNo });
      plan.stops = plan.stops.filter((s) => s.id !== worstStop.id);
      resequence(plan, depot);
    }
  }

  return orphanStops;
}

/**
 * Clusters the orphan pool into new route proposals sized to
 * `newVehicleCapacity`, farthest-from-depot stops first (they're the
 * hardest to serve, so give them first pick of a fresh bus).
 */
export function suggestNewRoutes(orphanStops, depot, { newVehicleCapacity = 40, schoolArrivalTime, avgSpeedKmh, maxDurationMinutes }) {
  const remaining = [...orphanStops];
  const newRoutes = [];
  let idx = 1;

  while (remaining.length) {
    remaining.sort((a, b) => haversineKm(b, depot) - haversineKm(a, depot));
    const seed = remaining.shift();
    const group = [seed];
    let riders = seed.headcount;

    while (riders < newVehicleCapacity && remaining.length) {
      const centroid = centroidOf(group);
      let bestIdx = -1;
      let bestDist = Infinity;
      remaining.forEach((s, i) => {
        if (riders + s.headcount > newVehicleCapacity) return;
        const d = haversineKm(centroid, s);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      if (bestIdx === -1) break;
      const [next] = remaining.splice(bestIdx, 1);
      group.push(next);
      riders += next.headcount;
    }

    const nn = nearestNeighbourOrder(depot, group);
    const { route, distance } = twoOpt(depot, nn);
    const pickup = computeArrivalSchedule(depot, route, { arrivalTime: schoolArrivalTime, avgSpeedKmh });
    const worstDuration = pickup.timings.length ? pickup.timings[0].durationToSchoolMinutes : 0;

    newRoutes.push({
      suggestedRouteNo: `NEW-${idx++}`,
      suggestedCapacity: newVehicleCapacity,
      riders,
      utilization: Number(((riders / newVehicleCapacity) * 100).toFixed(1)),
      distanceKm: Number(distance.toFixed(2)),
      stops: route,
      pickupTimings: pickup.timings,
      routeStartTime: pickup.startTime,
      worstDurationMinutes: worstDuration,
      meetsConstraint: worstDuration <= maxDurationMinutes,
    });
  }

  return newRoutes;
}
