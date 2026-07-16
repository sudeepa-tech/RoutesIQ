import { Router } from 'express';
import { z } from 'zod';
import { store } from '../models/store.js';
import { optimizeFleet } from '../services/optimizer.js';
import { computeArrivalSchedule, computeDepartureSchedule } from '../services/timing.js';
import { enforceMaxRideDuration } from '../services/rideDurationEnforcer.js';
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
  maxReassignDistanceKm: z.number().positive().optional(),
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
    const maxRideDurationMinutes = parsed.data.maxRideDurationMinutes ?? settings.maxRideDurationMinutes ?? 105;
    const maxReassignDistanceKm = parsed.data.maxReassignDistanceKm ?? settings.maxMergeDistanceKm ?? 12;

    const { vehicles, stops } = store.getDataset();
    const result = optimizeFleet({ stops, vehicles, depot, targetUtilizationPct });

    // enforce the max ride duration cap: no student should be on a bus
    // longer than maxRideDurationMinutes — reshapes routes as needed by
    // reassigning stops to nearby vehicles (never beyond maxReassignDistanceKm)
    const enforcement = enforceMaxRideDuration(result.plans, depot, {
      maxDurationMinutes: maxRideDurationMinutes,
      schoolArrivalTime,
      avgSpeedKmh,
      maxReassignDistanceKm,
    });
    result.plans = enforcement.plans;

    // recompute fleet-level distance summary since the enforcer may have
    // reshuffled stops between vehicles
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
    // (forward from school departure) schedules to every route
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
    result.summary.routesStillOverRideDuration = enforcement.stillOverBudget;

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
