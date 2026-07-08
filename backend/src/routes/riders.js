import { Router } from 'express';
import { store } from '../models/store.js';

const router = Router();

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

router.get('/stops', (req, res) => {
  const { stops } = store.getDataset();
  res.json({ stops, count: stops.length });
});

export default router;
