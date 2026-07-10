import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Tooltip } from 'react-leaflet';
import { Sparkles, ArrowRight } from 'lucide-react';
import Topbar from '../components/Topbar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useTransportData } from '../hooks/useTransportData.jsx';

const DEPOT = { lat: 12.899129358584288, lng: 77.75070888668907, name: 'IB Campus, SJP' };

const PALETTE = [
  '#F5B301', '#34D8C6', '#FF6B5E', '#7C9FFF', '#C792EA',
  '#4ADE80', '#FB923C', '#60A5FA', '#F472B6', '#A3E635',
];

/** Builds the final post-consolidation fleet: survivors carry merged
 * stops, unchanged routes keep their original stops, freed routes drop out. */
function buildFinalRoutes(optimization, consolidation) {
  const suggestions = consolidation?.suggestions ?? [];
  const freedRouteNos = new Set(suggestions.flatMap((s) => s.freedVehicles.map((v) => v.routeNo)));
  const survivorBySuggestion = new Map(suggestions.map((s) => [s.intoRoute, s]));

  return optimization.plans
    .filter((p) => !freedRouteNos.has(p.vehicle.routeNo))
    .map((p) => {
      const suggestion = survivorBySuggestion.get(p.vehicle.routeNo);
      if (suggestion) {
        return {
          routeNo: p.vehicle.routeNo,
          vehicleNo: p.vehicle.vehicleNo,
          capacity: p.vehicle.capacity,
          stops: suggestion.orderedStops,
          riders: suggestion.combinedRiders,
          utilization: suggestion.combinedUtilizationPct,
          status: 'merged',
          mergedFrom: suggestion.mergedRoutes,
        };
      }
      return {
        routeNo: p.vehicle.routeNo,
        vehicleNo: p.vehicle.vehicleNo,
        capacity: p.vehicle.capacity,
        stops: p.stops,
        riders: p.riders,
        utilization: p.utilization,
        status: 'unchanged',
        mergedFrom: null,
      };
    });
}

export default function SuggestedMap() {
  const { stats, optimization, consolidation, refreshStats } = useTransportData();
  const [selectedRoute, setSelectedRoute] = useState('all');
  const [filter, setFilter] = useState('all'); // all | merged | unchanged

  useEffect(() => {
    refreshStats().catch(() => {});
  }, [refreshStats]);

  const finalRoutes = useMemo(
    () => (optimization ? buildFinalRoutes(optimization, consolidation) : []),
    [optimization, consolidation]
  );

  const routeColor = useMemo(() => {
    const map = new Map();
    finalRoutes.forEach((r, i) => map.set(r.routeNo, PALETTE[i % PALETTE.length]));
    return map;
  }, [finalRoutes]);

  if (!stats?.datasetLoaded) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Suggested Map" subtitle="Full fleet after AI consolidation" />
        <EmptyState />
      </div>
    );
  }

  if (!optimization) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Suggested Map" subtitle="Full fleet after AI consolidation" />
        <NudgeState
          icon={Sparkles}
          title="Run the optimizer first"
          body="This map shows the whole fleet after AI consolidation — start on the Optimizer tab."
        />
      </div>
    );
  }

  const mergedCount = finalRoutes.filter((r) => r.status === 'merged').length;
  const freedCount = consolidation ? consolidation.suggestions.reduce((s, g) => s + g.freedVehicles.length, 0) : 0;
  const filteredRoutes = finalRoutes.filter((r) => filter === 'all' || r.status === filter);
  const visibleRoutes =
    selectedRoute === 'all' ? filteredRoutes : filteredRoutes.filter((r) => r.routeNo === selectedRoute);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <Topbar
        title="Suggested Map"
        subtitle={
          consolidation
            ? `${finalRoutes.length} active routes · ${mergedCount} merged · ${freedCount} vehicle${freedCount === 1 ? '' : 's'} freed`
            : 'Run AI Suggestions to see merges — showing current optimized routes'
        }
      />
      <div className="p-6 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {[
            ['all', `All routes (${finalRoutes.length})`],
            ['merged', `Merged (${mergedCount})`],
            ['unchanged', `Unchanged (${finalRoutes.length - mergedCount})`],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                filter === id
                  ? 'bg-panel2 text-ink border-border'
                  : 'text-ink-muted border-transparent hover:text-ink hover:bg-panel2/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative h-[520px] rounded-xl overflow-hidden border border-border">
          <div className="absolute z-[1000] top-3 left-3 panel px-3 py-2 max-h-[85%] overflow-y-auto w-52">
            <div className="text-xs font-medium text-ink-muted mb-2">Routes</div>
            <button
              onClick={() => setSelectedRoute('all')}
              className={`block w-full text-left text-xs font-mono px-2 py-1 rounded mb-1 ${
                selectedRoute === 'all' ? 'bg-panel2 text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              All routes
            </button>
            {filteredRoutes.map((r) => (
              <button
                key={r.routeNo}
                onClick={() => setSelectedRoute(r.routeNo)}
                className={`flex items-center gap-2 w-full text-left text-xs font-mono px-2 py-1 rounded mb-0.5 ${
                  selectedRoute === r.routeNo ? 'bg-panel2 text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: routeColor.get(r.routeNo) }} />
                {r.routeNo}
                {r.status === 'merged' && <span className="ml-auto text-[9px] text-amber">merged</span>}
              </button>
            ))}
            <div className="mt-2 pt-2 border-t border-border flex items-center gap-2 text-[10px] text-coral">
              <span className="w-2 h-2 rounded-full bg-coral shrink-0" />
              Student moved to a new bus
            </div>
          </div>

          <MapContainer center={[DEPOT.lat, DEPOT.lng]} zoom={12} className="w-full h-full">
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <CircleMarker
              center={[DEPOT.lat, DEPOT.lng]}
              radius={10}
              pathOptions={{ color: '#F5B301', fillColor: '#F5B301', fillOpacity: 1, weight: 2 }}
            >
              <Tooltip permanent direction="top">{DEPOT.name}</Tooltip>
            </CircleMarker>

            {visibleRoutes.map((r) => (
              <RoutePolyline key={r.routeNo} route={r} color={routeColor.get(r.routeNo)} />
            ))}
          </MapContainer>
        </div>

        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Route</th>
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Riders</th>
                <th className="px-4 py-3 font-medium text-right">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoutes.map((r) => (
                <tr key={r.routeNo} className="border-b border-border/60 last:border-0 hover:bg-panel2/40">
                  <td className="px-4 py-2.5">
                    <span className="route-chip border-amber/30 text-amber bg-amber/10">{r.routeNo}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{r.vehicleNo}</td>
                  <td className="px-4 py-2.5">
                    {r.status === 'merged' ? (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-teal">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal" />
                        Merged from {r.mergedFrom.join(', ')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                        <span className="w-1.5 h-1.5 rounded-full bg-ink-faint" />
                        Unchanged
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.riders}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.utilization}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NudgeState({ icon: Icon, title, body }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-center">
      <Icon size={28} className="text-ink-faint" />
      <h2 className="font-display font-medium">{title}</h2>
      <p className="text-sm text-ink-muted max-w-sm">{body}</p>
    </div>
  );
}

function RoutePolyline({ route, color }) {
  const positions = [
    [DEPOT.lat, DEPOT.lng],
    ...route.stops.map((s) => [s.lat, s.lng]),
    [DEPOT.lat, DEPOT.lng],
  ];
  return (
    <>
      <Polyline positions={positions} pathOptions={{ color, weight: route.status === 'merged' ? 3 : 2, opacity: 0.85 }} />
      {route.stops.map((s) => {
        const impacted = route.status === 'merged' && s.originRouteNo !== route.routeNo;
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={impacted ? 6 : 4}
            pathOptions={{
              color: impacted ? '#FF6B5E' : color,
              fillColor: impacted ? '#FF6B5E' : color,
              fillOpacity: 0.85,
              weight: impacted ? 2 : 1,
            }}
          >
            <Popup>
              <div className="text-xs">
                <strong>{route.routeNo}</strong> · {route.vehicleNo}
                {impacted && (
                  <>
                    <br />
                    Moved from {s.originRouteNo}
                  </>
                )}
                <br />
                {s.headcount} rider{s.headcount > 1 ? 's' : ''}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
