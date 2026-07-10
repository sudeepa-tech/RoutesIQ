import { Router } from 'express';
import { z } from 'zod';
import { store } from '../models/store.js';
import { optimizeFleet } from '../services/optimizer.js';
import { computeStopTimings } from '../services/timing.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

const optimizeSchema = z.object({
  depot: z
    .object({ lat: z.number(), lng: z.number(), name: z.string().optional() })
    .optional(),
  targetUtilizationPct: z.number().min(1).max(100).optional(),
  routeStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  avgSpeedKmh: z.number().positive().optional(),
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
    const routeStartTime = parsed.data.routeStartTime ?? settings.routeStartTime ?? '07:00';
    const avgSpeedKmh = parsed.data.avgSpeedKmh ?? settings.avgSpeedKmh ?? 25;

    const { vehicles, stops } = store.getDataset();
    const result = optimizeFleet({ stops, vehicles, depot, targetUtilizationPct });

    // attach ETA timing to every plan's stops
    for (const plan of result.plans) {
      if (!plan.stops.length) {
        plan.timings = [];
        continue;
      }
      plan.timings = computeStopTimings(depot, plan.stops, { routeStartTime, avgSpeedKmh });
    }
    result.summary.targetUtilizationPct = targetUtilizationPct;
    result.summary.routeStartTime = routeStartTime;
    result.summary.avgSpeedKmh = avgSpeedKmh;

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
