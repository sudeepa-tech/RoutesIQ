import { Router } from 'express';
import { store } from '../models/store.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

/**
 * GET /api/reports/final-fleet
 * The complete post-AI-Suggestions fleet: every route still in service
 * (merged survivors + untouched routes), each with its full student/staff
 * roster annotated with pickup point/time/duration and drop
 * point/time/duration on the FINAL route — not the original one.
 *
 * Requires both /api/optimize and /api/consolidate to have been run.
 */
router.get('/final-fleet', (req, res, next) => {
  const optimization = store.getOptimizationResult();
  const consolidation = store.getConsolidationResult();
  if (!optimization) {
    return next(new ApiError(422, 'Run /api/optimize first — no optimized routes to report on'));
  }
  if (!consolidation) {
    return next(new ApiError(422, 'Run /api/consolidate first — this report shows the fleet after AI Suggestions'));
  }

  const { riders, vehicles } = store.getDataset();
  const riderById = new Map(riders.map((r) => [r.id, r]));
  const vehicleByRouteNo = new Map(vehicles.map((v) => [v.routeNo, v]));

  const suggestions = consolidation.suggestions;
  const freedRouteNos = new Set(suggestions.flatMap((s) => s.freedVehicles.map((v) => v.routeNo)));
  const survivorBySuggestion = new Map(suggestions.map((s) => [s.intoRoute, s]));

  const routes = optimization.plans
    .filter((p) => !freedRouteNos.has(p.vehicle.routeNo))
    .map((p) => {
      const suggestion = survivorBySuggestion.get(p.vehicle.routeNo);
      const isMerged = Boolean(suggestion);

      const stops = isMerged ? suggestion.orderedStops : p.stops;
      const pickupTimings = isMerged ? suggestion.pickupTimings : p.pickupTimings;
      const dropTimings = isMerged ? suggestion.dropTimings : p.dropTimings;
      const pickupByStop = new Map((pickupTimings || []).map((t) => [t.stopId, t]));
      const dropByStop = new Map((dropTimings || []).map((t) => [t.stopId, t]));

      const mergedFromVehicles = isMerged
        ? suggestion.mergedRoutes.map((rn) => vehicleByRouteNo.get(rn)?.vehicleNo ?? rn)
        : [p.vehicle.vehicleNo];

      const roster = stops.flatMap((stop) => {
        const pickup = pickupByStop.get(stop.id);
        const drop = dropByStop.get(stop.id);
        return (stop.riderIds || [])
          .map((id) => riderById.get(id))
          .filter(Boolean)
          .map((rider) => ({
            studentId: rider.id,
            name: rider.name,
            classOrDesignation: rider.classOrDesignation,
            userType: rider.userType,
            pickStop: rider.pickStop,
            pickupTime: pickup?.pickupTime ?? null,
            pickupDurationMinutes: pickup?.durationToSchoolMinutes ?? null,
            dropStop: rider.dropStop ?? rider.pickStop,
            dropTime: drop?.dropTime ?? null,
            dropDurationMinutes: drop?.durationFromSchoolMinutes ?? null,
            vehicleNo: p.vehicle.vehicleNo,
          }));
      });

      // sort roster by pickup time for readability
      roster.sort((a, b) => (a.pickupTime || '').localeCompare(b.pickupTime || ''));

      return {
        routeNo: p.vehicle.routeNo,
        vehicleNo: p.vehicle.vehicleNo,
        capacity: p.vehicle.capacity,
        riderCount: isMerged ? suggestion.combinedRiders : p.riders,
        utilization: isMerged ? suggestion.combinedUtilizationPct : p.utilization,
        distanceKm: isMerged ? suggestion.distanceAfterKm : p.distanceKm,
        status: isMerged ? 'merged' : 'unchanged',
        mergedFromRoutes: isMerged ? suggestion.mergedRoutes : null,
        mergedFromVehicles,
        roster,
      };
    });

  routes.sort((a, b) => a.routeNo.localeCompare(b.routeNo));

  const freedVehicles = suggestions.flatMap((s) => s.freedVehicles);

  res.json({
    metrics: {
      originalVehicleCount: consolidation.metrics.originalVehicleCount,
      vehiclesFreedCount: consolidation.metrics.vehiclesFreedCount,
      remainingVehicleCount: routes.length,
    },
    freedVehicles,
    routes,
    routeCount: routes.length,
    totalRoster: routes.reduce((s, r) => s + r.roster.length, 0),
    schoolArrivalTime: optimization.summary.schoolArrivalTime,
    schoolDepartureTime: optimization.summary.schoolDepartureTime,
    computedAt: consolidation.computedAt,
  });
});

export default router;
