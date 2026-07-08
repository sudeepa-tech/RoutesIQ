import { Router } from 'express';
import { store } from '../models/store.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

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

export default router;
