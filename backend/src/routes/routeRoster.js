import { Router } from 'express';
import { store } from '../models/store.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

/**
 * Builds the final post-consolidation route list: survivors carry the
 * merged stop list, routes untouched by any merge keep their original
 * stops, and freed (merged-away) routes drop out entirely.
 */
function buildFinalRoutes(optimization, consolidation) {
  const suggestions = consolidation?.suggestions ?? [];
  const freedRouteNos = new Set(suggestions.flatMap((s) => s.freedVehicles.map((v) => v.routeNo)));
  const survivorBySuggestion = new Map(suggestions.map((s) => [s.intoRoute, s]));

  return optimization.plans
    .filter((p) => !freedRouteNos.has(p.vehicle.routeNo))
    .map((p) => {
      const suggestion = survivorBySuggestion.get(p.vehicle.routeNo);
      if (suggestion) {
        return {
          routeNo: p.vehicle.routeNo,
          vehicleNo: p.vehicle.vehicleNo,
          capacity: p.vehicle.capacity,
          stops: suggestion.orderedStops,
          riders: suggestion.combinedRiders,
          utilization: suggestion.combinedUtilizationPct,
          status: 'merged',
          mergedFrom: suggestion.mergedRoutes,
        };
      }
      return {
        routeNo: p.vehicle.routeNo,
        vehicleNo: p.vehicle.vehicleNo,
        capacity: p.vehicle.capacity,
        stops: p.stops,
        riders: p.riders,
        utilization: p.utilization,
        status: 'unchanged',
        mergedFrom: null,
      };
    });
}

/**
 * GET /api/reports/route-roster?basis=current|suggested&routeNo=I-07
 * basis=current   -> today's optimized routes (pre-consolidation)
 * basis=suggested -> the fleet after AI consolidation (falls back to
 *                     current if no consolidation has been run yet)
 */
router.get('/route-roster', (req, res, next) => {
  const optimization = store.getOptimizationResult();
  if (!optimization) {
    return next(new ApiError(422, 'Run /api/optimize first — no optimized routes to report on'));
  }

  const basis = req.query.basis === 'suggested' ? 'suggested' : 'current';
  const consolidation = basis === 'suggested' ? store.getConsolidationResult() : null;

  const { riders } = store.getDataset();
  const riderById = new Map(riders.map((r) => [r.id, r]));

  const routes =
    basis === 'suggested' && consolidation
      ? buildFinalRoutes(optimization, consolidation)
      : optimization.plans
          .filter((p) => p.stops.length > 0)
          .map((p) => ({
            routeNo: p.vehicle.routeNo,
            vehicleNo: p.vehicle.vehicleNo,
            capacity: p.vehicle.capacity,
            stops: p.stops,
            riders: p.riders,
            utilization: p.utilization,
            status: 'unchanged',
            mergedFrom: null,
          }));

  let filtered = routes;
  if (req.query.routeNo) {
    filtered = routes.filter((r) => r.routeNo === req.query.routeNo);
  }

  const result = filtered.map((r) => ({
    routeNo: r.routeNo,
    vehicleNo: r.vehicleNo,
    capacity: r.capacity,
    riderCount: r.riders,
    utilization: r.utilization,
    status: r.status,
    mergedFrom: r.mergedFrom,
    roster: r.stops.flatMap((stop) =>
      (stop.riderIds || [])
        .map((id) => riderById.get(id))
        .filter(Boolean)
        .map((rider) => ({
          studentId: rider.id,
          name: rider.name,
          classOrDesignation: rider.classOrDesignation,
          userType: rider.userType,
          pickStop: rider.pickStop,
        }))
    ),
  }));

  res.json({
    basis: basis === 'suggested' && !consolidation ? 'current (no consolidation run yet)' : basis,
    routes: result,
    routeCount: result.length,
    totalRoster: result.reduce((s, r) => s + r.roster.length, 0),
  });
});

export default router;
