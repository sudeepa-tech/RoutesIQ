import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Tooltip } from 'react-leaflet';
import { Sparkles } from 'lucide-react';
import Topbar from '../components/Topbar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useTransportData } from '../hooks/useTransportData.jsx';

const DEPOT = { lat: 12.899129358584288, lng: 77.75070888668907, name: 'IB Campus, SJP' };

const PALETTE = [
  '#F5B301', '#34D8C6', '#FF6B5E', '#7C9FFF', '#C792EA',
  '#4ADE80', '#FB923C', '#60A5FA', '#F472B6', '#A3E635',
];

export default function MapView() {
  const { stats, stops, optimization, consolidation, refreshStats, refreshVehiclesAndStops } = useTransportData();
  const [selectedRoute, setSelectedRoute] = useState('all');
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    refreshStats().catch(() => {});
    refreshVehiclesAndStops().catch(() => {});
  }, [refreshStats, refreshVehiclesAndStops]);

  const plans = optimization?.plans;

  const routeColor = useMemo(() => {
    const map = new Map();
    plans?.forEach((p, i) => map.set(p.vehicleId, PALETTE[i % PALETTE.length]));
    return map;
  }, [plans]);

  const suggestionColor = useMemo(() => {
    const map = new Map();
    consolidation?.suggestions?.forEach((s, i) => map.set(s.intoRoute, PALETTE[i % PALETTE.length]));
    return map;
  }, [consolidation]);

  if (!stats?.datasetLoaded) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Live Map" subtitle="Geographic route view" />
        <EmptyState />
      </div>
    );
  }

  const suggestedRouteNos = new Set(consolidation?.suggestions?.flatMap((s) => s.mergedRoutes) ?? []);
  const useSuggestionView = showSuggestions && consolidation?.suggestions?.length > 0;
  const visiblePlans = plans?.filter((p) => selectedRoute === 'all' || p.vehicleId === selectedRoute);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <Topbar title="Live Map" subtitle="Geographic route view" />
      <div className="flex-1 relative">
        {plans && (
          <div className="absolute z-[1000] top-4 left-4 panel px-3 py-2 max-h-[70vh] overflow-y-auto w-52">
            {consolidation?.suggestions?.length > 0 && (
              <button
                onClick={() => setShowSuggestions((s) => !s)}
                className={`flex items-center gap-1.5 w-full text-left text-xs font-medium px-2 py-1.5 rounded mb-2 border ${
                  showSuggestions
                    ? 'bg-amber/15 text-amber border-amber/30'
                    : 'text-ink-muted border-border hover:text-ink'
                }`}
              >
                <Sparkles size={12} />
                {showSuggestions ? 'Showing suggested changes' : 'Show suggested changes'}
              </button>
            )}
            <div className="text-xs font-medium text-ink-muted mb-2">
              {useSuggestionView ? 'Merge groups' : 'Routes'}
            </div>
            {!useSuggestionView && (
              <button
                onClick={() => setSelectedRoute('all')}
                className={`block w-full text-left text-xs font-mono px-2 py-1 rounded mb-1 ${
                  selectedRoute === 'all' ? 'bg-panel2 text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                All routes
              </button>
            )}
            {useSuggestionView
              ? consolidation.suggestions.map((s) => (
                  <div key={s.intoRoute} className="flex items-center gap-2 text-xs font-mono px-2 py-1 mb-0.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: suggestionColor.get(s.intoRoute) }} />
                    {s.mergedRoutes.join(' + ')} → {s.intoRoute}
                  </div>
                ))
              : plans.map((p) => (
                  <button
                    key={p.vehicleId}
                    onClick={() => setSelectedRoute(p.vehicleId)}
                    className={`flex items-center gap-2 w-full text-left text-xs font-mono px-2 py-1 rounded mb-0.5 ${
                      selectedRoute === p.vehicleId ? 'bg-panel2 text-ink' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: routeColor.get(p.vehicleId) }} />
                    {p.vehicle.routeNo}
                    {suggestedRouteNos.has(p.vehicle.routeNo) && !useSuggestionView && (
                      <span className="ml-auto text-[9px] text-amber">●</span>
                    )}
                  </button>
                ))}
          </div>
        )}

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

          {useSuggestionView
            ? consolidation.suggestions.map((s) => (
                <SuggestionPolyline key={s.intoRoute} suggestion={s} color={suggestionColor.get(s.intoRoute)} />
              ))
            : visiblePlans
            ? visiblePlans.map((p) => (
                <RoutePolyline key={p.vehicleId} plan={p} color={routeColor.get(p.vehicleId)} />
              ))
            : stops.map((s) => (
                <CircleMarker
                  key={s.id}
                  center={[s.lat, s.lng]}
                  radius={4 + Math.min(6, s.headcount)}
                  pathOptions={{ color: '#34D8C6', fillColor: '#34D8C6', fillOpacity: 0.6, weight: 1 }}
                >
                  <Popup>
                    <div className="text-xs">
                      <strong>{s.label}</strong>
                      <br />
                      {s.headcount} rider{s.headcount > 1 ? 's' : ''}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
        </MapContainer>
      </div>
    </div>
  );
}

function RoutePolyline({ plan, color }) {
  const positions = [
    [DEPOT.lat, DEPOT.lng],
    ...plan.stops.map((s) => [s.lat, s.lng]),
    [DEPOT.lat, DEPOT.lng],
  ];
  return (
    <>
      <Polyline positions={positions} pathOptions={{ color, weight: 2.5, opacity: 0.85 }} />
      {plan.stops.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.lat, s.lng]}
          radius={4 + Math.min(6, s.headcount)}
          pathOptions={{ color, fillColor: color, fillOpacity: 0.75, weight: 1 }}
        >
          <Popup>
            <div className="text-xs">
              <strong>{plan.vehicle.routeNo}</strong> · {plan.vehicle.vehicleNo}
              <br />
              {s.label}
              <br />
              {s.headcount} rider{s.headcount > 1 ? 's' : ''}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

/** Shows a merged group: solid line for the final survivor route, with
 * stops colored by whether they were already on the survivor or moved
 * in from a freed route. */
function SuggestionPolyline({ suggestion, color }) {
  const positions = [
    [DEPOT.lat, DEPOT.lng],
    ...suggestion.orderedStops.map((s) => [s.lat, s.lng]),
    [DEPOT.lat, DEPOT.lng],
  ];
  return (
    <>
      <Polyline positions={positions} pathOptions={{ color, weight: 3, opacity: 0.9 }} />
      {suggestion.orderedStops.map((s) => {
        const impacted = s.originRouteNo !== suggestion.intoRoute;
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
                <strong>{impacted ? `Moved from ${s.originRouteNo}` : 'Original route'}</strong>
                <br />
                Now on {suggestion.intoRoute} ({suggestion.intoVehicle})
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
