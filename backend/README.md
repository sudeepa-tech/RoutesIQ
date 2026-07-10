# Transport Optimizer — Backend

Node.js / Express API that ingests a school transport workbook (vehicle
master + rider lat/long sheets) and computes AI-optimized bus routes using
a capacitated clustering + 2-opt route-sequencing engine.

## Stack
- Express 4, Helmet, CORS, rate limiting, gzip compression
- `xlsx` for spreadsheet ingestion, `multer` for uploads
- `zod` for request validation
- File-persisted store (`src/models/store.js` + `src/services/persistence.js`)
  — an uploaded workbook and any manual edits survive a server restart,
  written to `backend/data/store.json` (debounced writes). Swap for
  Postgres/Mongo behind the same interface for multi-instance production.

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
| GET/POST/PUT/DELETE | `/api/vehicles[/:id]` | Full vehicle/route CRUD                  |
| GET/POST/PUT/DELETE | `/api/drivers[/:id]`  | Full driver CRUD                         |
| GET/POST/PUT/DELETE | `/api/riders[/:id]`   | Full rider (student/staff) CRUD          |
| GET    | `/api/riders/stops`  | Aggregated geo-stops with headcounts             |
| GET/PUT | `/api/settings`     | Global settings: utilization cap, route start time, avg speed |
| POST   | `/api/optimize`      | Run the optimizer (`targetUtilizationPct`, `depot`, `routeStartTime`, `avgSpeedKmh`) |
| GET    | `/api/optimize/latest`| Last computed optimization result               |
| POST   | `/api/consolidate`   | AI merge suggestions + ROI (needs `/api/optimize` run first) |
| GET    | `/api/reports/impacted-students` | Riders whose vehicle changed due to consolidation, with new vehicle + ETA |
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

## Configurable utilization cap

`targetUtilizationPct` (1-100, default 100) is a **soft** per-vehicle
target passed to `/api/optimize` or set globally via `PUT /api/settings`.
The clustering stage tries to keep every bus at or under this % of its
real seat capacity. If the cap is too tight to seat every rider, it's
relaxed automatically on a per-vehicle basis — but a vehicle's true seat
capacity (`vehicle.capacity`) is a hard limit that is never exceeded,
regardless of the cap. The response's `summary.vehiclesOverTargetCap`
tells you how many buses needed the relaxation.

## Pickup time estimates (`src/services/timing.js`)

Every optimize/consolidate response includes a `timings`/per-stop ETA,
computed by walking the sequenced route outward from the depot at a
configurable average speed (`avgSpeedKmh`, default 25 km/h) starting from
`routeStartTime` (default `07:00`). This is a planning estimate, not a
live-traffic ETA.

## Consolidation advisor & ROI (`src/services/consolidationAdvisor.js`)

Runs on top of an already-optimized plan. Sorts routes by utilization
ascending and greedily groups nearby under-utilized routes together —
pulling in a 2nd, 3rd, even 4th nearby route if needed — until the
group's combined load lands in a genuine "full load" band (default
90–100% of the largest vehicle in the group), then keeps that
largest-capacity vehicle as the survivor and releases the rest. Merged
stops are re-sequenced with the same nearest-neighbour + 2-opt logic
used by the optimizer.

`POST /api/consolidate` body params (all optional):
- `utilizationThreshold` (default 70) — routes below this % are merge candidates
- `minCombinedUtilization` (default 90) — a merge is only accepted if the
  resulting load is at least this % full (and never over 100%)
- `maxMergeDistanceKm` (default 12) — max centroid distance to allow a merge
- `costPerVehiclePerMonth` (default ₹45,000) — driver + lease + maintenance
- `fuelCostPerKm` (default ₹18)
- `tripsPerDay` (default 2) — pickup + drop
- `operatingDaysPerMonth` (default 22)

Returns merge suggestions (each with the full list of merged route
numbers, the surviving route, and every freed vehicle), plus an ROI
breakdown (fixed monthly/annual savings from fewer vehicles, plus the
fuel cost delta from the resulting route-distance change). All financial
figures are driven by the caller-supplied assumptions above — adjust them
to match your institute's real costs.

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
