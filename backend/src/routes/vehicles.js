import { Router } from 'express';
import { z } from 'zod';
import { store } from '../models/store.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

const vehicleSchema = z.object({
  routeNo: z.string().min(1),
  vehicleNo: z.string().min(1),
  capacity: z.number().int().positive(),
  startPoint: z.string().optional().nullable(),
  startLat: z.number().optional().nullable(),
  startLng: z.number().optional().nullable(),
  endPoint: z.string().optional().nullable(),
});
const vehiclePatchSchema = vehicleSchema.partial();

router.get('/', (req, res) => {
  const { vehicles } = store.getDataset();
  res.json({ vehicles, count: vehicles.length });
});

router.get('/:id', (req, res, next) => {
  const { vehicles } = store.getDataset();
  const vehicle = vehicles.find((v) => v.id === req.params.id);
  if (!vehicle) return next(new ApiError(404, `Vehicle/route ${req.params.id} not found`));
  res.json({ vehicle });
});

router.post('/', (req, res, next) => {
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, 'Invalid vehicle payload', parsed.error.flatten()));
  const { vehicles } = store.getDataset();
  if (vehicles.some((v) => v.routeNo === parsed.data.routeNo)) {
    return next(new ApiError(409, `Route number ${parsed.data.routeNo} already exists`));
  }
  const created = store.addVehicle(parsed.data);
  res.status(201).json({ vehicle: created });
});

router.put('/:id', (req, res, next) => {
  const parsed = vehiclePatchSchema.safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, 'Invalid vehicle payload', parsed.error.flatten()));
  const updated = store.updateVehicle(req.params.id, parsed.data);
  if (!updated) return next(new ApiError(404, `Vehicle/route ${req.params.id} not found`));
  res.json({ vehicle: updated });
});

router.delete('/:id', (req, res, next) => {
  const ok = store.deleteVehicle(req.params.id);
  if (!ok) return next(new ApiError(404, `Vehicle/route ${req.params.id} not found`));
  res.status(204).end();
});

export default router;
