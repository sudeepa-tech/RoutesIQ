import { Router } from 'express';
import { z } from 'zod';
import { store } from '../models/store.js';
import { optimizeFleet } from '../services/optimizer.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

const optimizeSchema = z.object({
  depot: z
    .object({ lat: z.number(), lng: z.number(), name: z.string().optional() })
    .optional(),
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

    const { vehicles, stops } = store.getDataset();
    const result = optimizeFleet({ stops, vehicles, depot });

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
