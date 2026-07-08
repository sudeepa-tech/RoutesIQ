import { useEffect } from 'react';
import { Users, BusFront, Gauge, TrendingDown } from 'lucide-react';
import Topbar from '../components/Topbar.jsx';
import StatCard from '../components/StatCard.jsx';
import { useTransportData } from '../hooks/useTransportData.jsx';
import EmptyState from '../components/EmptyState.jsx';

export default function Dashboard() {
  const { stats, refreshStats } = useTransportData();

  useEffect(() => {
    refreshStats().catch(() => {});
  }, [refreshStats]);

  if (!stats?.datasetLoaded) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Dashboard" subtitle="Fleet-wide overview" />
        <EmptyState />
      </div>
    );
  }

  const opt = stats.optimization?.summary;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <Topbar title="Dashboard" subtitle="Fleet-wide overview" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total riders" value={stats.riders.toLocaleString()} icon={Users} accent="ink" />
          <StatCard label="Active routes" value={stats.vehicles} icon={BusFront} accent="amber" />
          <StatCard
            label="Fleet utilization"
            value={stats.fleetUtilization}
            unit="%"
            icon={Gauge}
            accent={stats.fleetUtilization > 90 ? 'coral' : 'teal'}
          />
          <StatCard
            label="Distance saved"
            value={opt ? opt.distanceSavedPct : '—'}
            unit={opt ? '%' : ''}
            icon={TrendingDown}
            accent="teal"
            delta={opt ? `${opt.distanceSavedKm} km vs baseline` : 'Run optimizer'}
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="panel p-5 lg:col-span-2">
            <h3 className="font-display font-medium text-sm mb-4">Rider composition</h3>
            <div className="space-y-3">
              {Object.entries(stats.byUserType).map(([type, count]) => {
                const pct = Math.round((count / stats.riders) * 100);
                return (
                  <div key={type}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-ink-muted">{type}</span>
                      <span className="font-mono">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-panel2 rounded-full overflow-hidden">
                      <div
                        className={type === 'Student' ? 'h-full bg-amber' : 'h-full bg-teal'}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel p-5">
            <h3 className="font-display font-medium text-sm mb-4">Dataset</h3>
            <dl className="space-y-2.5 text-sm">
              <Row label="Unique pickup stops" value={stats.stops} />
              <Row label="Total seat capacity" value={stats.totalCapacity} />
              <Row
                label="Uploaded"
                value={stats.uploadedAt ? new Date(stats.uploadedAt).toLocaleString() : '—'}
              />
              {opt && <Row label="Vehicles used" value={`${opt.vehiclesUsed}/${opt.vehiclesAvailable}`} />}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b border-border/60 pb-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
