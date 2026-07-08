import { useEffect, useState } from 'react';
import Topbar from '../components/Topbar.jsx';
import RouteTable from '../components/RouteTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useTransportData } from '../hooks/useTransportData.jsx';

export default function RoutesPage() {
  const { stats, vehicles, optimization, refreshStats, refreshVehiclesAndStops } = useTransportData();
  const [query, setQuery] = useState('');

  useEffect(() => {
    refreshStats().catch(() => {});
    refreshVehiclesAndStops().catch(() => {});
  }, [refreshStats, refreshVehiclesAndStops]);

  if (!stats?.datasetLoaded) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Routes" subtitle="Vehicle & route master" />
        <EmptyState />
      </div>
    );
  }

  const plans = optimization?.plans;
  const filteredVehicles = vehicles.filter(
    (v) =>
      v.routeNo.toLowerCase().includes(query.toLowerCase()) ||
      v.vehicleNo.toLowerCase().includes(query.toLowerCase())
  );
  const filteredPlans = plans?.filter(
    (p) =>
      p.vehicle.routeNo.toLowerCase().includes(query.toLowerCase()) ||
      p.vehicle.vehicleNo.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <Topbar title="Routes" subtitle={`${vehicles.length} routes in fleet`} />
      <div className="p-6 space-y-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by route or vehicle number…"
          className="w-full max-w-sm bg-panel border border-border rounded-lg px-3 py-2 text-sm placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-teal"
        />
        <RouteTable plans={filteredPlans} vehicles={filteredVehicles} />
      </div>
    </div>
  );
}
