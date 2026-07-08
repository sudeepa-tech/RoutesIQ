# Transport Optimizer — Backend

Node.js / Express API that ingests a school transport workbook (vehicle
master + rider lat/long sheets) and computes AI-optimized bus routes using
a capacitated clustering + 2-opt route-sequencing engine.

## Stack
- Express 4, Helmet, CORS, rate limiting, gzip compression
- `xlsx` for spreadsheet ingestion, `multer` for uploads
- `zod` for request validation
- Zero external DB — in-memory store (`src/models/store.js`) behind a
  small interface; swap for Postgres/Mongo without touching routes/services.

## Getting started
```bash
cp .env.example .env
npm install
npm run dev        # nodemon, http://localhost:4000
```

## API

| Method | Path                | Description                                   |
|--------|---------------------|------------------------------------------------|
| GET    | `/health`           | Liveness check                                  |
| POST   | `/api/upload`        | Multipart `file` field — ingest `.xlsx` workbook |
| GET    | `/api/vehicles`      | List all vehicles/routes                        |
| GET    | `/api/vehicles/:id`  | Single vehicle/route                             |
| GET    | `/api/riders`        | List riders (`?userType=Student\|Staff`, `?q=name`) |
| GET    | `/api/riders/stops`  | Aggregated geo-stops with headcounts             |
| POST   | `/api/optimize`      | Run the optimizer (optional custom `depot`)      |
| GET    | `/api/optimize/latest`| Last computed optimization result               |
| GET    | `/api/stats`         | Dashboard summary                                |

## Optimization engine (`src/services/optimizer.js`)

1. **Capacitated seed clustering** — farthest-point seeding (k-means++
   style) + capacity-constrained nearest-centroid assignment groups
   pickup stops into vehicle-sized clusters.
2. **Route sequencing** — nearest-neighbour construction + 2-opt local
   search orders each vehicle's stops to minimize round-trip distance to
   the campus depot.
3. Every optimization response includes a naive-baseline comparison so the
   frontend can show distance saved (km and %).

Distances use the Haversine great-circle formula; no external maps API
key is required for the optimization itself (only the frontend's map
tiles need one, optionally).

## Workbook format expected
- A sheet with `Rt.Nos`, `Veh.Nos`, `Seat Cap`, `Starting Point`,
  `Starting Point,latitude/Longitude` columns (sheet name containing
  "sheet1"/"vehicle"/"route").
- A sheet with `Adm No`, `Name`, `Class/Designation`, `Pick Stop`,
  `User Type`, `latitude`, `Longitude` columns (sheet name containing
  "latlong"/"student"/"rider").

## Tests
```bash
npm test
```
