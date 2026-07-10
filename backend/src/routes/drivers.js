import { Router } from 'express';
import { z } from 'zod';
import { store } from '../models/store.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

const driverSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  licenseNo: z.string().optional().nullable(),
  assignedVehicleId: z.string().optional().nullable(),
});
const driverPatchSchema = driverSchema.partial();

router.get('/', (req, res) => {
  const drivers = store.getDrivers();
  res.json({ drivers, count: drivers.length });
});

router.post('/', (req, res, next) => {
  const parsed = driverSchema.safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, 'Invalid driver payload', parsed.error.flatten()));
  const created = store.addDriver(parsed.data);
  res.status(201).json({ driver: created });
});

router.put('/:id', (req, res, next) => {
  const parsed = driverPatchSchema.safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, 'Invalid driver payload', parsed.error.flatten()));
  const updated = store.updateDriver(req.params.id, parsed.data);
  if (!updated) return next(new ApiError(404, `Driver ${req.params.id} not found`));
  res.json({ driver: updated });
});

router.delete('/:id', (req, res, next) => {
  const ok = store.deleteDriver(req.params.id);
  if (!ok) return next(new ApiError(404, `Driver ${req.params.id} not found`));
  res.status(204).end();
});

export default router;
