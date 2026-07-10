import { Router } from 'express';
import { z } from 'zod';
import { store } from '../models/store.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

const riderSchema = z.object({
  name: z.string().min(1),
  classOrDesignation: z.string().optional().nullable(),
  pickStop: z.string().min(1),
  dropStop: z.string().optional().nullable(),
  userType: z.enum(['Student', 'Staff']).default('Student'),
  lat: z.number(),
  lng: z.number(),
});
const riderPatchSchema = riderSchema.partial();

router.get('/', (req, res) => {
  const { riders } = store.getDataset();
  const { userType, q } = req.query;
  let filtered = riders;
  if (userType) filtered = filtered.filter((r) => r.userType === userType);
  if (q) {
    const needle = String(q).toLowerCase();
    filtered = filtered.filter((r) => r.name.toLowerCase().includes(needle));
  }
  res.json({ riders: filtered, count: filtered.length });
});

// must be registered before /:id so "stops" isn't captured as an id
router.get('/stops', (req, res) => {
  const { stops } = store.getDataset();
  res.json({ stops, count: stops.length });
});

router.get('/:id', (req, res, next) => {
  const { riders } = store.getDataset();
  const rider = riders.find((r) => r.id === req.params.id);
  if (!rider) return next(new ApiError(404, `Rider ${req.params.id} not found`));
  res.json({ rider });
});

router.post('/', (req, res, next) => {
  const parsed = riderSchema.safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, 'Invalid rider payload', parsed.error.flatten()));
  const created = store.addRider(parsed.data);
  res.status(201).json({ rider: created });
});

router.put('/:id', (req, res, next) => {
  const parsed = riderPatchSchema.safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, 'Invalid rider payload', parsed.error.flatten()));
  const updated = store.updateRider(req.params.id, parsed.data);
  if (!updated) return next(new ApiError(404, `Rider ${req.params.id} not found`));
  res.json({ rider: updated });
});

router.delete('/:id', (req, res, next) => {
  const ok = store.deleteRider(req.params.id);
  if (!ok) return next(new ApiError(404, `Rider ${req.params.id} not found`));
  res.status(204).end();
});

export default router;
