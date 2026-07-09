import { useEffect, useMemo, useState } from 'react';
import { Download, ArrowUpDown, AlertTriangle, CheckCircle2, TrendingDown } from 'lucide-react';
import Topbar from '../components/Topbar.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useTransportData } from '../hooks/useTransportData.jsx';

const THRESHOLDS = { under: 50, over: 95 };

function statusFor(util) {
  if (util == null) return { label: 'Not routed', color: 'text-ink-muted', dot: 'bg-ink-faint' };
  if (util > THRESHOLDS.over) return { label: 'Over capacity', color: 'text-coral', dot: 'bg-coral' };
  if (util < THRESHOLDS.under) return { label: 'Under-utilized', color: 'text-amber', dot: 'bg-amber' };
  return { label: 'Optimal', color: 'text-teal', dot: 'bg-teal' };
}

export default function Report() {
  const { stats, vehicles, optimization, refreshStats, refreshVehiclesAndStops } = useTransportData();
  const [sortKey, setSortKey] = useState('utilization');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    refreshStats().catch(() => {});
    refreshVehiclesAndStops().catch(() => {});
  }, [refreshStats, refreshVehiclesAndStops]);

  const rows = useMemo(() => {
    const plans = optimization?.plans;
    const base = plans
      ? plans.map((p) => ({
          routeNo: p.vehicle.routeNo,
          vehicleNo: p.vehicle.vehicleNo,
          startPoint: p.vehicle.startPoint,
          capacity: p.vehicle.capacity,
          riders: p.riders,
          distanceKm: p.distanceKm,
          utilization: p.utilization,
        }))
      : vehicles.map((v) => ({
          routeNo: v.routeNo,
          vehicleNo: v.vehicleNo,
          startPoint: v.startPoint,
          capacity: v.capacity,
          riders: null,
          distanceKm: null,
          utilization: null,
        }));

    const sorted = [...base].sort((a, b) => {
      const av = a[sortKey] ?? -1;
      const bv = b[sortKey] ?? -1;
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return sorted;
  }, [vehicles, optimization, sortKey, sortDir]);

  if (!stats?.datasetLoaded) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Report" subtitle="Vehicle utilization report" />
        <EmptyState />
      </div>
    );
  }

  const utilValues = rows.map((r) => r.utilization).filter((u) => u != null);
  const avgUtil = utilValues.length
    ? Number((utilValues.reduce((s, v) => s + v, 0) / utilValues.length).toFixed(1))
    : null;
  const underCount = utilValues.filter((u) => u < THRESHOLDS.under).length;
  const overCount = utilValues.filter((u) => u > THRESHOLDS.over).length;

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const exportCsv = () => {
    const header = ['Route No', 'Vehicle No', 'Start Point', 'Capacity', 'Riders', 'Utilization %', 'Distance (km)'];
    const lines = rows.map((r) =>
      [r.routeNo, r.vehicleNo, r.startPoint, r.capacity, r.riders ?? '', r.utilization ?? '', r.distanceKm ?? ''].join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vehicle-utilization-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <Topbar title="Report" subtitle="Vehicle utilization report" />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-ink-muted max-w-xl">
            {optimization
              ? 'Utilization reflects riders assigned by the last optimization run.'
              : 'Showing seat capacity only — run the optimizer to populate rider counts and utilization.'}
          </p>
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 text-sm font-medium bg-panel2 border border-border px-3.5 py-2 rounded-lg hover:bg-panel transition"
          >
            <Download size={15} />
            Export CSV
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Average utilization"
            value={avgUtil ?? '—'}
            unit={avgUtil != null ? '%' : ''}
            icon={TrendingDown}
            accent="teal"
          />
          <StatCard label="Fleet size" value={rows.length} accent="ink" />
          <StatCard
            label="Under-utilized (<50%)"
            value={underCount}
            icon={AlertTriangle}
            accent={underCount > 0 ? 'amber' : 'ink'}
          />
          <StatCard
            label="Over capacity (>95%)"
            value={overCount}
            icon={overCount > 0 ? AlertTriangle : CheckCircle2}
            accent={overCount > 0 ? 'coral' : 'teal'}
          />
        </div>

        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted text-xs uppercase tracking-wider">
                <SortableTh label="Route" active={sortKey === 'routeNo'} dir={sortDir} onClick={() => toggleSort('routeNo')} />
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Start point</th>
                <SortableTh label="Capacity" align="right" active={sortKey === 'capacity'} dir={sortDir} onClick={() => toggleSort('capacity')} />
                <SortableTh label="Riders" align="right" active={sortKey === 'riders'} dir={sortDir} onClick={() => toggleSort('riders')} />
                <SortableTh label="Utilization" align="right" active={sortKey === 'utilization'} dir={sortDir} onClick={() => toggleSort('utilization')} />
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status = statusFor(r.utilization);
                return (
                  <tr key={r.routeNo} className="border-b border-border/60 last:border-0 hover:bg-panel2/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="route-chip border-amber/30 text-amber bg-amber/10">{r.routeNo}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{r.vehicleNo}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{r.startPoint}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{r.capacity}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{r.riders ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-24 h-1.5 bg-panel2 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${status.dot}`}
                            style={{ width: `${Math.min(100, r.utilization ?? 0)}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs w-10 text-right">
                          {r.utilization != null ? `${r.utilization}%` : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`flex items-center gap-1.5 text-xs font-medium ${status.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SortableTh({ label, align = 'left', active, dir, onClick }) {
  return (
    <th
      onClick={onClick}
      className={`px-4 py-3 font-medium cursor-pointer select-none hover:text-ink transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        <ArrowUpDown size={11} className={active ? 'text-teal' : 'text-ink-faint'} />
      </span>
    </th>
  );
}
