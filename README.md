# RouteIQ — AI Transport Route Optimizer

Production-ready full-stack app for education institutes to plan and
optimize school bus routes: upload the transport workbook, and RouteIQ
clusters riders into vehicle-sized, geographically-sensible routes and
sequences each route to minimize distance — all in under a second for
1,000+ riders.

Built and validated against a real institute dataset: **43 vehicles,
561 pickup stops, 1,289 students & staff** — the optimizer found a
**~72–74% distance reduction** vs. a naive fill-in-order baseline.

```
transport-optimizer/
├── backend/     Node.js + Express API — parsing, optimization engine, REST API
└── frontend/    React 18 + Vite dashboard — upload, map, optimizer, routes, riders
```

## Quick start

```bash
# 1. Backend
cd backend
cp .env.example .env
npm install
npm run dev            # http://localhost:4000

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev             # http://localhost:5173
```

Open http://localhost:5173, click **Upload workbook**, select the
institute's `.xlsx` transport file, then go to **Optimizer → Run
optimizer**.

## How the optimization works

1. **Ingest** — `backend/src/services/xlsxParser.js` reads the vehicle
   master sheet (route no., vehicle no., seat capacity, start point) and
   the rider sheet (name, class/designation, pickup coordinates),
   aggregating riders that share a pickup point into geo-stops.
2. **Cluster** — `backend/src/services/optimizer.js` seeds cluster
   centroids with farthest-point sampling (k-means++ style) and assigns
   each stop to the nearest vehicle that still has seat capacity,
   heaviest stops first, updating centroids incrementally. This is a
   capacitated-clustering heuristic for the Capacitated Vehicle Routing
   Problem (CVRP).
3. **Sequence** — within each vehicle's cluster, stops are ordered with
   nearest-neighbour construction then refined with 2-opt local search,
   which removes route-crossing segments to minimize round-trip distance
   to the campus depot.
4. **Compare** — every run also computes a naive fill-in-order baseline
   so the UI can report kilometers and percentage saved.

Full technical docs: [`backend/README.md`](backend/README.md) ·
[`frontend/README.md`](frontend/README.md)

## Production notes
- Swap `backend/src/models/store.js` (in-memory) for a real database —
  the rest of the codebase talks to it through a small interface, so no
  other files need to change.
- Add authentication (e.g. JWT + institute SSO) in front of `/api/upload`
  and `/api/optimize` before deploying — this reference build is
  intentionally auth-free to keep setup simple.
- The optimizer is a heuristic, not an exact solver — for fleets much
  larger than a few hundred vehicles, consider swapping in OR-Tools or a
  commercial VRP solver behind the same `optimizeFleet()` interface.
- Run `npm test` in `backend/` (5 unit tests covering distance math,
  capacity constraints, and end-to-end optimization) before shipping
  changes to the engine.
