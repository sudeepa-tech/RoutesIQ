import { Router } from 'express';
import { z } from 'zod';
import { store } from '../models/store.js';
import { suggestConsolidation, computeRoi } from '../services/consolidationAdvisor.js';
import { computeStopTimings } from '../services/timing.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

const bodySchema = z.object({
  utilizationThreshold: z.number().min(1).max(100).optional(),
  maxMergeDistanceKm: z.number().positive().optional(),
  minCombinedUtilization: z.number().min(1).max(100).optional(),
  costPerVehiclePerMonth: z.number().nonnegative().optional(),
  fuelCostPerKm: z.number().nonnegative().optional(),
  tripsPerDay: z.number().positive().optional(),
  operatingDaysPerMonth: z.number().positive().optional(),
  routeStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  avgSpeedKmh: z.number().positive().optional(),
  depot: z.object({ lat: z.number(), lng: z.number(), name: z.string().optional() }).optional(),
});

router.post('/', (req, res, next) => {
  try {
    const optimization = store.getOptimizationResult();
    if (!optimization) {
      throw new ApiError(422, 'Run /api/optimize first — consolidation needs an optimized fleet plan');
    }

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new ApiError(400, 'Invalid request body', parsed.error.flatten());
    const opts = parsed.data;
    const settings = store.getSettings();

    const depot = opts.depot ?? {
      lat: Number(process.env.DEPOT_LAT) || 12.899129358584288,
      lng: Number(process.env.DEPOT_LNG) || 77.75070888668907,
      name: process.env.DEPOT_NAME || 'Campus',
    };

    const result = suggestConsolidation(optimization.plans, depot, {
      utilizationThreshold: opts.utilizationThreshold,
      maxMergeDistanceKm: opts.maxMergeDistanceKm,
      minCombinedUtilization: opts.minCombinedUtilization,
    });

    const routeStartTime = opts.routeStartTime ?? settings.routeStartTime ?? '07:00';
    const avgSpeedKmh = opts.avgSpeedKmh ?? settings.avgSpeedKmh ?? 25;
    for (const suggestion of result.suggestions) {
      suggestion.timings = computeStopTimings(depot, suggestion.orderedStops, { routeStartTime, avgSpeedKmh });
    }

    const roi = computeRoi(result.metrics, {
      costPerVehiclePerMonth: opts.costPerVehiclePerMonth,
      fuelCostPerKm: opts.fuelCostPerKm,
      tripsPerDay: opts.tripsPerDay,
      operatingDaysPerMonth: opts.operatingDaysPerMonth,
    });

    const fullResult = { ...result, roi };
    store.setConsolidationResult(fullResult);
    res.json(fullResult);
  } catch (err) {
    next(err);
  }
});

export default router;
