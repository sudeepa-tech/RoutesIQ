import { Router } from 'express';
import { store } from '../models/store.js';
import { ApiError } from '../middleware/errorHandler.js';
import routeRosterRouter from './routeRoster.js';

const router = Router();
router.use(routeRosterRouter);

/**
 * GET /api/reports/impacted-students
 * Lists every rider whose vehicle assignment changed because of the last
 * consolidation run: old vs new vehicle, and old vs new pickup/drop time
 * + duration (from pickup point to school, and from school to drop point).
 */
router.get('/impacted-students', (req, res, next) => {
  const optimization = store.getOptimizationResult();
  const consolidation = store.getConsolidationResult();
  if (!optimization) {
    return next(new ApiError(422, 'Run /api/optimize first — no optimized routes to report on'));
  }
  if (!consolidation) {
    return next(new ApiError(422, 'Run /api/consolidate first — no consolidation result to report on'));
  }

  const { riders, vehicles } = store.getDataset();
  const riderById = new Map(riders.map((r) => [r.id, r]));
  const vehicleByRouteNo = new Map(vehicles.map((v) => [v.routeNo, v]));

  // index the ORIGINAL (pre-consolidation) per-stop pickup/drop timings by
  // routeNo + stopId, so we can report each student's old schedule
  const originalTimingByRouteAndStop = new Map();
  for (const plan of optimization.plans) {
    const pickupByStop = new Map((plan.pickupTimings || []).map((t) => [t.stopId, t]));
    const dropByStop = new Map((plan.dropTimings || []).map((t) => [t.stopId, t]));
    for (const stop of plan.stops) {
      originalTimingByRouteAndStop.set(`${plan.vehicle.routeNo}::${stop.id}`, {
        pickup: pickupByStop.get(stop.id),
        drop: dropByStop.get(stop.id),
      });
    }
  }

  const rows = [];
  for (const suggestion of consolidation.suggestions) {
    const newPickupByStop = new Map((suggestion.pickupTimings || []).map((t) => [t.stopId, t]));
    const newDropByStop = new Map((suggestion.dropTimings || []).map((t) => [t.stopId, t]));

    for (const stop of suggestion.orderedStops) {
      if (stop.originRouteNo === suggestion.intoRoute) continue; // not impacted, already on survivor route
      const oldVehicle = vehicleByRouteNo.get(stop.originRouteNo);
      const oldTiming = originalTimingByRouteAndStop.get(`${stop.originRouteNo}::${stop.id}`);
      const newPickup = newPickupByStop.get(stop.id);
      const newDrop = newDropByStop.get(stop.id);

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
          oldPickupTime: oldTiming?.pickup?.pickupTime ?? null,
          oldPickupDurationMinutes: oldTiming?.pickup?.durationToSchoolMinutes ?? null,
          newPickupTime: newPickup?.pickupTime ?? null,
          newPickupDurationMinutes: newPickup?.durationToSchoolMinutes ?? null,
          oldDropTime: oldTiming?.drop?.dropTime ?? null,
          oldDropDurationMinutes: oldTiming?.drop?.durationFromSchoolMinutes ?? null,
          newDropTime: newDrop?.dropTime ?? null,
          newDropDurationMinutes: newDrop?.durationFromSchoolMinutes ?? null,
        });
      }
    }
  }

  rows.sort((a, b) => (a.newPickupTime || '').localeCompare(b.newPickupTime || ''));

  res.json({
    rows,
    count: rows.length,
    computedAt: consolidation.computedAt,
    groupsAffected: consolidation.suggestions.length,
    schoolArrivalTime: optimization.summary.schoolArrivalTime,
    schoolDepartureTime: optimization.summary.schoolDepartureTime,
  });
});

export default router;
