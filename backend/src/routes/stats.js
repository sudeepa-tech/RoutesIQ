import { Router } from 'express';
import { store } from '../models/store.js';

const router = Router();

router.get('/', (req, res) => {
  const { vehicles, stops, riders, uploadedAt } = store.getDataset();
  const optimization = store.getOptimizationResult();

  const totalCapacity = vehicles.reduce((s, v) => s + v.capacity, 0);
  const totalRiders = riders.length;
  const byUserType = riders.reduce((acc, r) => {
    acc[r.userType] = (acc[r.userType] || 0) + 1;
    return acc;
  }, {});

  res.json({
    datasetLoaded: vehicles.length > 0,
    uploadedAt,
    vehicles: vehicles.length,
    stops: stops.length,
    riders: totalRiders,
    byUserType,
    totalCapacity,
    fleetUtilization: totalCapacity
      ? Number(((totalRiders / totalCapacity) * 100).toFixed(1))
      : 0,
    optimization: optimization
      ? {
          computedAt: optimization.computedAt,
          summary: optimization.summary,
        }
      : null,
  });
});

export default router;
