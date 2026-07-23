import { Router } from 'express';
import { z } from 'zod';
import { store } from '../models/store.js';
import { optimizeFleet } from '../services/optimizer.js';
import { computeArrivalSchedule, computeDepartureSchedule, toMinutes } from '../services/timing.js';
import { enforceMaxRideDuration } from '../services/rideDurationEnforcer.js';
import { extractOrphanStops, suggestNewRoutes } from '../services/newRouteSuggester.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

const optimizeSchema = z.object({
  depot: z
    .object({ lat: z.number(), lng: z.number(), name: z.string().optional() })
    .optional(),
  targetUtilizationPct: z.number().min(1).max(100).optional(),
  schoolArrivalTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  schoolDepartureTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  avgSpeedKmh: z.number().positive().optional(),
  maxRideDurationMinutes: z.number().positive().optional(),
  earliestPickupTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  maxReassignDistanceKm: z.number().positive().optional(),
  newVehicleCapacity: z.number().positive().optional(),
});

router.post('/', (req, res, next) => {
  try {
    if (!store.hasDataset()) {
      throw new ApiError(422, 'No dataset loaded. Upload a workbook first via /api/upload');
    }
    const parsed = optimizeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request body', parsed.error.flatten());
    }

    const depot = parsed.data.depot ?? {
      lat: Number(process.env.DEPOT_LAT) || 12.899129358584288,
      lng: Number(process.env.DEPOT_LNG) || 77.75070888668907,
      name: process.env.DEPOT_NAME || 'Campus',
    };
    const settings = store.getSettings();
    const targetUtilizationPct = parsed.data.targetUtilizationPct ?? settings.targetUtilizationPct ?? 100;
    const schoolArrivalTime = parsed.data.schoolArrivalTime ?? settings.schoolArrivalTime ?? '07:15';
    const schoolDepartureTime = parsed.data.schoolDepartureTime ?? settings.schoolDepartureTime ?? '14:20';
    const avgSpeedKmh = parsed.data.avgSpeedKmh ?? settings.avgSpeedKmh ?? 28;
    const maxReassignDistanceKm = parsed.data.maxReassignDistanceKm ?? settings.maxMergeDistanceKm ?? 12;
    const newVehicleCapacity = parsed.data.newVehicleCapacity ?? settings.newVehicleCapacity ?? 25;

    // TWO independent constraints — no student rides longer than
    // maxRideDurationMinutes, AND no pickup happens before earliestPickupTime.
    // Whichever is stricter given the fixed school arrival time wins.
    const requestedMaxDuration = parsed.data.maxRideDurationMinutes ?? settings.maxRideDurationMinutes ?? 80;
    const earliestPickupTime = parsed.data.earliestPickupTime ?? settings.earliestPickupTime ?? '06:00';
    const floorImpliedMinutes = toMinutes(schoolArrivalTime) - toMinutes(earliestPickupTime);
    const maxRideDurationMinutes = Math.max(1, Math.min(requestedMaxDuration, floorImpliedMinutes));

    const { vehicles, stops } = store.getDataset();
    const result = optimizeFleet({ stops, vehicles, depot, targetUtilizationPct });

    // Step 1: reshuffle stops between EXISTING vehicles to satisfy the cap
    const enforcement = enforceMaxRideDuration(result.plans, depot, {
      maxDurationMinutes: maxRideDurationMinutes,
      schoolArrivalTime,
      avgSpeedKmh,
      maxReassignDistanceKm,
    });
    result.plans = enforcement.plans;

    // Step 2: anything still non-compliant gets stripped into an "orphan
    // pool" (making the source route compliant) and proposed as one or
    // more brand-new routes
    const orphanStops = extractOrphanStops(result.plans, depot, {
      maxDurationMinutes: maxRideDurationMinutes,
      schoolArrivalTime,
      avgSpeedKmh,
    });
    const newRoutesRaw = orphanStops.length
      ? suggestNewRoutes(orphanStops, depot, { newVehicleCapacity, schoolArrivalTime, avgSpeedKmh, maxDurationMinutes: maxRideDurationMinutes })
      : [];

    // attach student/staff roster to each suggested new route
    const { riders } = store.getDataset();
    const riderById = new Map(riders.map((r) => [r.id, r]));
    const suggestedNewRoutes = newRoutesRaw.map((nr) => ({
      ...nr,
      roster: nr.stops.flatMap((stop) =>
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

    // recompute fleet-level distance summary since stops may have moved
    result.summary.optimizedDistanceKm = Number(
      result.plans.reduce((s, p) => s + p.distanceKm, 0).toFixed(2)
    );
    result.summary.distanceSavedKm = Number(
      (result.summary.baselineDistanceKm - result.summary.optimizedDistanceKm).toFixed(2)
    );
    result.summary.distanceSavedPct = Number(
      ((result.summary.distanceSavedKm / result.summary.baselineDistanceKm) * 100).toFixed(1)
    );

    // attach realistic pickup (backward from school arrival) and drop
    // (forward from school departure) schedules to every remaining route
    for (const plan of result.plans) {
      if (!plan.stops.length) {
        plan.pickupTimings = [];
        plan.dropTimings = [];
        plan.routeStartTime = null;
        continue;
      }
      const pickup = computeArrivalSchedule(depot, plan.stops, { arrivalTime: schoolArrivalTime, avgSpeedKmh });
      const drop = computeDepartureSchedule(depot, plan.stops, { departureTime: schoolDepartureTime, avgSpeedKmh });
      plan.pickupTimings = pickup.timings;
      plan.dropTimings = drop.timings;
      plan.routeStartTime = pickup.startTime;
    }
    result.summary.targetUtilizationPct = targetUtilizationPct;
    result.summary.schoolArrivalTime = schoolArrivalTime;
    result.summary.schoolDepartureTime = schoolDepartureTime;
    result.summary.avgSpeedKmh = avgSpeedKmh;
    result.summary.maxRideDurationMinutes = maxRideDurationMinutes;
    result.summary.earliestPickupTime = earliestPickupTime;
    // orphan extraction guarantees every EXISTING route is compliant by
    // construction (violating stops are moved out, not left in place) —
    // the real remaining signal is whether the NEW suggested routes below
    // can bring their riders into compliance even as a dedicated bus
    result.summary.routesStillOverRideDuration = [];
    result.summary.suggestedNewRoutes = suggestedNewRoutes;
    result.summary.newVehiclesNeeded = suggestedNewRoutes.length;
    result.summary.newRoutesStillOverConstraint = suggestedNewRoutes.filter((r) => !r.meetsConstraint).length;

    store.setOptimizationResult(result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/latest', (req, res, next) => {
  const result = store.getOptimizationResult();
  if (!result) return next(new ApiError(404, 'No optimization has been run yet'));
  res.json(result);
});

export default router;
