import { Router } from 'express';
import { store } from '../models/store.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

/**
 * GET /api/reports/impacted-students
 * Lists every rider whose vehicle assignment changed because of the last
 * consolidation run, along with their new vehicle/route and an estimated
 * pickup time on the new (merged) route.
 */
router.get('/impacted-students', (req, res, next) => {
  const consolidation = store.getConsolidationResult();
  if (!consolidation) {
    return next(new ApiError(422, 'Run /api/consolidate first — no consolidation result to report on'));
  }

  const { riders, vehicles } = store.getDataset();
  const riderById = new Map(riders.map((r) => [r.id, r]));
  const vehicleByRouteNo = new Map(vehicles.map((v) => [v.routeNo, v]));

  const rows = [];
  for (const suggestion of consolidation.suggestions) {
    const timingByStopId = new Map((suggestion.timings || []).map((t) => [t.stopId, t]));
    for (const stop of suggestion.orderedStops) {
      if (stop.originRouteNo === suggestion.intoRoute) continue; // not impacted, already on survivor route
      const oldVehicle = vehicleByRouteNo.get(stop.originRouteNo);
      const timing = timingByStopId.get(stop.id);
      for (const riderId of stop.riderIds || []) {
        const rider = riderById.get(riderId);
        if (!rider) continue;
        rows.push({
          studentId: rider.id,
          studentName: rider.name,
          classOrDesignation: rider.classOrDesignation,
          userType: rider.userType,
          pickStop: rider.pickStop,
          oldRouteNo: stop.originRouteNo,
          oldVehicleNo: oldVehicle?.vehicleNo ?? 'Unknown',
          newRouteNo: suggestion.intoRoute,
          newVehicleNo: suggestion.intoVehicle,
          estimatedPickupTime: timing?.etaClockTime ?? null,
        });
      }
    }
  }

  rows.sort((a, b) => (a.estimatedPickupTime || '').localeCompare(b.estimatedPickupTime || ''));

  res.json({
    rows,
    count: rows.length,
    computedAt: consolidation.computedAt,
    groupsAffected: consolidation.suggestions.length,
  });
});

export default router;
