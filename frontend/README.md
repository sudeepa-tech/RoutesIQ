# RouteIQ — Frontend

React 18 + Vite dashboard for the AI transport route optimizer. Talks to
the backend API (`../backend`) to upload workbooks, run optimization, and
visualize routes.

## Stack
- React 18, React Router 6
- Tailwind CSS (custom "fleet control" design tokens — see `tailwind.config.js`)
- `react-leaflet` for the geographic route map (OpenStreetMap tiles, no API key)
- `recharts`-ready for further charting, `lucide-react` icons
- Axios API layer (`src/services/api.js`) + a small context/hook
  (`src/hooks/useTransportData.js`) for shared app state

## Getting started
```bash
cp .env.example .env      # point VITE_API_URL at your backend
npm install
npm run dev                # http://localhost:5173
```

The dev server proxies `/api/*` to the backend (see `vite.config.js`) if
`VITE_API_URL` is left unset.

## Pages
- **Dashboard** — fleet KPIs, rider composition, dataset info
- **Routes** — sortable/searchable vehicle & route table (post-optimization
  shows live rider counts, utilization, distance per route)
- **Live Map** — Leaflet map with the campus depot, per-route colored
  polylines and stop markers, route filter sidebar
- **Optimizer** — triggers the backend's capacitated clustering + 2-opt
  engine, shows baseline-vs-optimized distance and per-route results
- **Riders** — searchable student/staff directory with pick-stop info

## Build
```bash
npm run build   # outputs to dist/
npm run preview
```
