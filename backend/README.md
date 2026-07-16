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
| GET    | `/api/reports/impacted-students` | Riders whose vehicle changed due to consolidation, with old vs new pickup/drop times + duration |
| GET    | `/api/reports/route-roster` | Full student/staff list per route (`?basis=current\|suggested`, optional `?routeNo=I-07`) |
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

## Realistic fixed-schedule timing (`src/services/timing.js`)

Every school bus must reach campus at the SAME fixed time (default
`07:15`) and leave campus at the SAME fixed time (default `14:20`) —
buses don't share a start time and arrive whenever.

- **Pickup** (`computeArrivalSchedule`): works backward from the fixed
  arrival time, so a route with more/farther stops simply starts
  earlier. Each stop gets a `pickupTime` and `durationToSchoolMinutes`.
- **Drop** (`computeDepartureSchedule`): works forward from the fixed
  departure time, retracing the pickup route in reverse (the stop
  closest to school — picked up last in the morning — is dropped off
  first in the afternoon, mirroring how a bus physically retraces its
  road path). Each stop gets a `dropTime` and `durationFromSchoolMinutes`.

Both are planning estimates (straight-line distance ÷ average speed),
not live-traffic ETAs.

## Route compactness (`maxStopRadiusKm`)

Pure capacity-based clustering can otherwise let a large-capacity vehicle
greedily absorb scattered, far-flung single-rider stops just because it
"has room" — producing unrealistic 60km+ routes and pre-dawn pickups.
`clusterStops`/`optimizeFleet` accept `maxStopRadiusKm` (default 7km): a
stop is only assigned to a vehicle whose current cluster centroid is
within that radius, with a bounded (3x radius) fallback so no rider ever
goes unseated. This keeps routes geographically realistic, sometimes at
the cost of a vehicle not reaching its target utilization — which is
exactly what the consolidation advisor's two-pass merge (below) then
cleans up.

## Maximum ride duration / earliest pickup (`src/services/rideDurationEnforcer.js`)

No pickup should happen before `05:30` (equivalently: no student rides
longer than `maxRideDurationMinutes`, default 105 — the gap between 05:30
and the fixed 07:15 school arrival). This runs automatically after every
`/api/optimize` call:

1. Compute each route's pickup schedule; the farthest-in-time stop is
   the one to check (pickup schedules are backward-from-arrival, so the
   first stop always has the longest remaining ride).
2. If it's over budget, find another vehicle within
   `maxReassignDistanceKm` (default 12km, same hard cap as consolidation
   merges) with seat room, preferring one whose own resulting duration
   would also stay under the cap; if every nearby vehicle is already
   loaded, falls back to whichever nearby move most reduces the current
   worst-case duration, guaranteeing the fleet's total time-over-budget
   keeps shrinking every move rather than oscillating.
3. Move the stop, re-sequence both affected routes, and repeat until no
   route violates the cap or no further improving move exists.

Any stop that genuinely can't be reassigned within the distance/capacity
constraints (rare — an isolated demand pocket farther than any spare
vehicle could reach) is left in place and reported in
`summary.routesStillOverRideDuration`, rather than silently violating the
distance or capacity constraints to force a fix.

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

Runs on top of an already-optimized plan, in TWO passes:

1. **Full-load pass** — sorts routes by utilization ascending and
   greedily groups nearby under-utilized routes together (pulling in a
   2nd, 3rd, even 4th route if needed) until the combined load lands in
   a genuine full-load band (default 90–100%).
2. **Mop-up pass** — anything still below `utilizationThreshold` (default
   70%) after pass 1 gets a second, more lenient attempt: same grouping
   logic, but only requiring the combined load reach the 70% threshold
   (not the full 90%+ band), searched over a wider radius (1.75x). This
   guarantees "no vehicle left under 70% if a geographically reasonable
   merge exists" — the response's `metrics.vehiclesStillUnderThreshold`
   lists any vehicle that remains under threshold because no feasible
   merge was found nearby even after both passes.

Every merge is checked against the pickup-time floor too — a merge is
never proposed if it would push any student's pickup earlier than
`maxRideDurationMinutes` allows (both while growing the candidate group
and as a final safety check on the committed route), since combining
routes only ever adds stops and can otherwise easily create a pickup
earlier than any single original route had.

Each merge keeps the group's largest-capacity vehicle as the survivor and
releases the rest.

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
