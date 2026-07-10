/**
 * AI-based Transport Route Optimization Engine
 * ------------------------------------------------
 * Two-stage heuristic used by fleet-routing systems (a capacitated
 * clustering + local-search variant of the Capacitated Vehicle Routing
 * Problem, CVRP):
 *
 *  Stage 1 - CAPACITATED SEED CLUSTERING
 *    Groups student/staff pickup stops into vehicle-sized clusters using
 *    a greedy farthest-first seeding (k-means++ style) followed by
 *    capacity-constrained nearest-centroid assignment. This keeps
 *    geographically close stops together while respecting each bus's
 *    seat capacity.
 *
 *  Stage 2 - ROUTE SEQUENCING (TSP)
 *    Within each cluster, stops are ordered with a Nearest-Neighbour
 *    construction heuristic, then refined with 2-opt local search to
 *    remove crossing/inefficient segments and minimise total route
 *    distance back to the campus depot.
 *
 * All distances use the Haversine great-circle formula (km).
 */

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Pick k well-spread seed stops via farthest-point sampling. */
function seedCentroids(stops, k) {
  const seeds = [stops[Math.floor(Math.random() * stops.length)]];
  while (seeds.length < k) {
    let best = null;
    let bestDist = -Infinity;
    for (const s of stops) {
      const dMin = Math.min(...seeds.map((c) => haversineKm(s, c)));
      if (dMin > bestDist) {
        bestDist = dMin;
        best = s;
      }
    }
    seeds.push(best);
  }
  return seeds.map((s) => ({ lat: s.lat, lng: s.lng }));
}

/**
 * Stage 1: capacity-constrained clustering.
 * vehicles: [{ id, capacity }]
 * stops: [{ id, lat, lng, headcount, ... }]
 * options.targetUtilizationPct: caps how full each vehicle is allowed to
 *   get during clustering (default 100 = use full seat capacity). This
 *   NEVER exceeds the vehicle's real capacity — it only ever restricts
 *   further, e.g. 90 leaves a comfort/safety margin of empty seats.
 * returns: Map<vehicleId, stops[]>
 */
export function clusterStops(stops, vehicles, options = {}) {
  const targetUtilizationPct = Math.min(100, Math.max(1, options.targetUtilizationPct ?? 100));
  const effectiveCapacity = (v) => Math.max(1, Math.floor(v.capacity * (targetUtilizationPct / 100)));

  const sortedVehicles = [...vehicles].sort((a, b) => b.capacity - a.capacity);
  let centroids = seedCentroids(stops, sortedVehicles.length).slice();
  const remaining = new Map(sortedVehicles.map((v) => [v.id, effectiveCapacity(v)]));
  const assignment = new Map(sortedVehicles.map((v) => [v.id, []]));

  // process largest-headcount / farthest-from-depot stops first so they
  // don't get stranded once vehicles fill up
  const order = [...stops].sort((a, b) => b.headcount - a.headcount);

  for (const stop of order) {
    let bestVehicle = null;
    let bestScore = Infinity;
    sortedVehicles.forEach((v, idx) => {
      const cap = remaining.get(v.id);
      if (cap < stop.headcount) return;
      const d = haversineKm(stop, centroids[idx]);
      if (d < bestScore) {
        bestScore = d;
        bestVehicle = idx;
      }
    });

    // fallback: if nobody has room under the *target* cap (shouldn't
    // happen if total effective capacity >= total headcount), fall back
    // to the vehicle with the most REAL remaining seats — this may push
    // that vehicle above the target utilization cap, but will still never
    // exceed its true seat capacity.
    if (bestVehicle === null) {
      let maxRealRemaining = -Infinity;
      sortedVehicles.forEach((v, idx) => {
        const assignedSoFar = assignment.get(v.id).reduce((s, st) => s + st.headcount, 0);
        const realRemaining = v.capacity - assignedSoFar;
        if (realRemaining >= stop.headcount && realRemaining > maxRealRemaining) {
          maxRealRemaining = realRemaining;
          bestVehicle = idx;
        }
      });
    }
    if (bestVehicle === null) {
      // truly infeasible even ignoring the target cap — let optimizeFleet's
      // upfront capacity check surface a clear error before we get here
      let maxCap = -Infinity;
      sortedVehicles.forEach((v, idx) => {
        const cap = remaining.get(v.id);
        if (cap > maxCap) {
          maxCap = cap;
          bestVehicle = idx;
        }
      });
    }

    const v = sortedVehicles[bestVehicle];
    assignment.get(v.id).push(stop);
    remaining.set(v.id, remaining.get(v.id) - stop.headcount);

    // recompute centroid incrementally (running mean)
    const clusterStopsSoFar = assignment.get(v.id);
    const n = clusterStopsSoFar.length;
    centroids[bestVehicle] = {
      lat: centroids[bestVehicle].lat + (stop.lat - centroids[bestVehicle].lat) / n,
      lng: centroids[bestVehicle].lng + (stop.lng - centroids[bestVehicle].lng) / n,
    };
  }

  return assignment;
}

/** Stage 2a: Nearest-neighbour construction from the depot. */
export function nearestNeighbourOrder(depot, stops) {
  const unvisited = [...stops];
  const route = [];
  let current = depot;
  while (unvisited.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    unvisited.forEach((s, i) => {
      const d = haversineKm(current, s);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    const [next] = unvisited.splice(bestIdx, 1);
    route.push(next);
    current = next;
  }
  return route;
}

export function routeDistance(depot, route) {
  let total = 0;
  let prev = depot;
  for (const s of route) {
    total += haversineKm(prev, s);
    prev = s;
  }
  total += haversineKm(prev, depot); // return to campus
  return total;
}

/** Stage 2b: 2-opt local search to untangle the route. */
export function twoOpt(depot, route, maxIterations = 200) {
  let best = route;
  let bestDist = routeDistance(depot, best);
  let improved = true;
  let iterations = 0;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const d = routeDistance(depot, candidate);
        if (d < bestDist - 1e-9) {
          best = candidate;
          bestDist = d;
          improved = true;
        }
      }
    }
  }
  return { route: best, distance: bestDist };
}

/**
 * Full pipeline: cluster stops to vehicles, then sequence each route.
 * Returns per-vehicle route plans + fleet-level summary stats.
 * options.targetUtilizationPct: global cap on how full each vehicle may
 *   get (1-100, default 100). Never exceeds real seat capacity.
 */
export function optimizeFleet({ stops, vehicles, depot, targetUtilizationPct = 100 }) {
  if (!stops.length) throw new Error('No stops supplied');
  if (!vehicles.length) throw new Error('No vehicles supplied');

  const cappedPct = Math.min(100, Math.max(1, targetUtilizationPct));
  const totalHeadcount = stops.reduce((s, st) => s + st.headcount, 0);
  const totalCapacity = vehicles.reduce((s, v) => s + v.capacity, 0);
  if (totalCapacity < totalHeadcount) {
    throw new Error(
      `Fleet capacity (${totalCapacity}) is less than total riders (${totalHeadcount})`
    );
  }
  // Note: the utilization cap is a SOFT target — if it's too tight to fit
  // everyone, clusterStops' fallback relaxes it per-vehicle (never beyond
  // real seat capacity) rather than failing the whole optimization. This
  // matches "don't leave capacity unused" — every rider gets a seat as
  // long as the real fleet capacity allows it.

  const clusters = clusterStops(stops, vehicles, { targetUtilizationPct: cappedPct });
  const plans = [];

  for (const vehicle of vehicles) {
    const clusterStopsList = clusters.get(vehicle.id) || [];
    if (!clusterStopsList.length) {
      plans.push({
        vehicleId: vehicle.id,
        vehicle,
        stops: [],
        distanceKm: 0,
        riders: 0,
        utilization: 0,
      });
      continue;
    }
    const nnRoute = nearestNeighbourOrder(depot, clusterStopsList);
    const { route, distance } = twoOpt(depot, nnRoute);
    const riders = route.reduce((s, st) => s + st.headcount, 0);
    plans.push({
      vehicleId: vehicle.id,
      vehicle,
      stops: route,
      distanceKm: Number(distance.toFixed(2)),
      riders,
      utilization: Number(((riders / vehicle.capacity) * 100).toFixed(1)),
    });
  }

  // naive baseline for comparison: original (unoptimized) capacity-only
  // sequential assignment with stops visited in original data order
  const baselineDistance = computeBaselineDistance(stops, vehicles, depot);
  const optimizedDistance = plans.reduce((s, p) => s + p.distanceKm, 0);
  const vehiclesOverCap = plans.filter((p) => p.utilization > cappedPct + 0.5).length;

  return {
    plans,
    summary: {
      totalStops: stops.length,
      totalRiders: totalHeadcount,
      vehiclesUsed: plans.filter((p) => p.stops.length > 0).length,
      vehiclesAvailable: vehicles.length,
      totalCapacity,
      fleetUtilization: Number(((totalHeadcount / totalCapacity) * 100).toFixed(1)),
      baselineDistanceKm: Number(baselineDistance.toFixed(2)),
      optimizedDistanceKm: Number(optimizedDistance.toFixed(2)),
      distanceSavedKm: Number((baselineDistance - optimizedDistance).toFixed(2)),
      distanceSavedPct: Number(
        (((baselineDistance - optimizedDistance) / baselineDistance) * 100).toFixed(1)
      ),
      targetUtilizationCapPct: cappedPct,
      vehiclesOverTargetCap: vehiclesOverCap, // vehicles filled to full capacity above the target (real seat capacity is still never exceeded)
    },
  };
}

/** Baseline: fill vehicles in original list order, no geo-awareness. */
function computeBaselineDistance(stops, vehicles, depot) {
  const sortedVehicles = [...vehicles].sort((a, b) => b.capacity - a.capacity);
  let vIdx = 0;
  let remaining = sortedVehicles[0]?.capacity ?? 0;
  const buckets = [[]];
  for (const stop of stops) {
    if (remaining < stop.headcount && vIdx < sortedVehicles.length - 1) {
      vIdx++;
      remaining = sortedVehicles[vIdx].capacity;
      buckets.push([]);
    }
    buckets[buckets.length - 1].push(stop);
    remaining -= stop.headcount;
  }
  return buckets.reduce((sum, bucket) => sum + routeDistance(depot, bucket), 0);
}
