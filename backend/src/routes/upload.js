import { Router } from 'express';
import multer from 'multer';
import { parseTransportWorkbook } from '../services/xlsxParser.js';
import { store } from '../models/store.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB) || 15) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.originalname.endsWith('.xlsx');
    cb(ok ? null : new ApiError(400, 'Only .xlsx files are accepted'), ok);
  },
});

router.post('/', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, 'No file uploaded (field name must be "file")');

    const { vehicles, stops, riders, meta } = parseTransportWorkbook(req.file.buffer);

    if (!vehicles.length) throw new ApiError(422, 'No vehicles/routes found in workbook');
    if (!stops.length) throw new ApiError(422, 'No rider pickup stops found in workbook');

    store.setDataset({ vehicles, stops, riders, meta });

    res.status(201).json({
      message: 'Workbook ingested successfully',
      summary: {
        vehicles: vehicles.length,
        stops: stops.length,
        riders: riders.length,
        totalCapacity: vehicles.reduce((s, v) => s + v.capacity, 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
