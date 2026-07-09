import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import uploadRouter from './routes/upload.js';
import vehiclesRouter from './routes/vehicles.js';
import ridersRouter from './routes/riders.js';
import optimizeRouter from './routes/optimize.js';
import consolidateRouter from './routes/consolidate.js';
import statsRouter from './routes/stats.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
  })
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/upload', uploadRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/riders', ridersRouter);
app.use('/api/optimize', optimizeRouter);
app.use('/api/consolidate', consolidateRouter);
app.use('/api/stats', statsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Transport Optimizer API listening on port ${PORT}`);
});

export default app;
