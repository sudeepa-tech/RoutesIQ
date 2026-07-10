import { Router } from 'express';
import { z } from 'zod';
import { store } from '../models/store.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

const settingsSchema = z.object({
  targetUtilizationPct: z.number().min(1).max(100).optional(),
  routeStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  avgSpeedKmh: z.number().positive().optional(),
});

router.get('/', (req, res) => {
  res.json({ settings: store.getSettings() });
});

router.put('/', (req, res, next) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, 'Invalid settings payload', parsed.error.flatten()));
  const settings = store.updateSettings(parsed.data);
  res.json({ settings });
});

export default router;
