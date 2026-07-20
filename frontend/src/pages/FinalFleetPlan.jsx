import { useEffect, useState } from 'react';
import { Download, ChevronDown, ChevronRight, Bus, Sparkles, Users, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import Topbar from '../components/Topbar.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useTransportData } from '../hooks/useTransportData.jsx';
import api from '../services/api.js';

export default function FinalFleetPlan() {
  const { stats, refreshStats } = useTransportData();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedRoute, setExpandedRoute] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    refreshStats().catch(() => {});
  }, [refreshStats]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getFinalFleet();
      setData(res);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (stats?.datasetLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.datasetLoaded]);

  if (!stats?.datasetLoaded) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Final Fleet Plan" subtitle="Routes after AI Suggestions" />
        <EmptyState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Final Fleet Plan" subtitle="Routes after AI Suggestions" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Sparkles size={28} className="text-ink-faint" />
          <h2 className="font-display font-medium">Not ready yet</h2>
          <p className="text-sm text-ink-muted max-w-sm">{error}</p>
          <p className="text-xs text-ink-faint">Run the Optimizer, then AI Suggestions, then come back here.</p>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Final Fleet Plan" subtitle="Routes after AI Suggestions" />
        <div className="panel m-6 p-8 text-center text-ink-muted text-sm">Loading final fleet plan…</div>
      </div>
    );
  }

  const filteredRoutes = query
    ? data.routes
        .map((r) => ({ ...r, roster: r.roster.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())) }))
        .filter((r) => r.roster.length > 0)
    : data.routes;

  const exportXlsx = () => {
    const rows = [];
    for (const r of data.routes) {
      for (const s of r.roster) {
        rows.push({
          Route: r.routeNo,
          Vehicle: r.vehicleNo,
          Status: r.status === 'merged' ? `Merged from ${r.mergedFromRoutes.join(', ')}` : 'Unchanged',
          'Merged Vehicle Numbers': r.mergedFromVehicles.join(', '),
          Student: s.name,
          'Class/Role': s.classOrDesignation,
          Type: s.userType,
          'Pickup Point': s.pickStop,
          'Pickup Time': s.pickupTime,
          'Pickup Duration (min)': s.pickupDurationMinutes,
          'Drop Point': s.dropStop,
          'Drop Time': s.dropTime,
          'Drop Duration (min)': s.dropDurationMinutes,
        });
      }
    }
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key] ?? '').length)) + 2,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Final Fleet Plan');
    XLSX.writeFile(workbook, `final-fleet-plan-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <Topbar
        title="Final Fleet Plan"
        subtitle={`${data.metrics.originalVehicleCount} → ${data.metrics.remainingVehicleCount} vehicles (${data.metrics.vehiclesFreedCount} freed)`}
      />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-ink-muted max-w-xl">
            The complete route plan after AI Suggestions consolidation — click a route to see every
            student and staff member on it, with their pickup and drop point, time, and duration on the
            new route.
          </p>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search student name…"
                className="bg-panel border border-border rounded-lg pl-8 pr-3 py-2 text-sm w-56 placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
            <button
              onClick={exportXlsx}
              className="flex items-center gap-2 text-sm font-medium bg-panel2 border border-border px-3.5 py-2 rounded-lg hover:bg-panel transition"
            >
              <Download size={15} />
              Export .xlsx
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Original fleet" value={data.metrics.originalVehicleCount} icon={Bus} accent="ink" />
          <StatCard label="Vehicles freed" value={data.metrics.vehiclesFreedCount} icon={Sparkles} accent="amber" />
          <StatCard label="Active routes now" value={data.metrics.remainingVehicleCount} icon={Bus} accent="teal" />
          <StatCard label="Total riders" value={data.totalRoster.toLocaleString()} icon={Users} accent="ink" />
        </div>

        {data.freedVehicles.length > 0 && (
          <div className="panel p-4">
            <div className="text-xs font-medium text-ink-muted mb-2">Freed vehicles ({data.freedVehicles.length})</div>
            <div className="flex flex-wrap gap-2">
              {data.freedVehicles.map((v) => (
                <span key={v.vehicleNo} className="route-chip border-coral/30 text-coral bg-coral/10">
                  {v.routeNo} · {v.vehicleNo} ({v.capacity}-seat)
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {filteredRoutes.map((r) => {
            const isExpanded = expandedRoute === r.routeNo;
            return (
              <div key={r.routeNo} className="panel overflow-hidden">
                <button
                  onClick={() => setExpandedRoute(isExpanded ? null : r.routeNo)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-panel2/40 transition"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown size={14} className="text-ink-faint" /> : <ChevronRight size={14} className="text-ink-faint" />}
                    <span className="route-chip border-amber/30 text-amber bg-amber/10">{r.routeNo}</span>
                    <span className="font-mono text-xs text-ink-muted">{r.vehicleNo}</span>
                    {r.status === 'merged' ? (
                      <span className="text-xs text-teal font-medium">
                        Merged from {r.mergedFromRoutes.join(', ')} ({r.mergedFromVehicles.join(', ')})
                      </span>
                    ) : (
                      <span className="text-xs text-ink-muted">Unchanged</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-ink-muted">
                    <span>{r.riderCount}/{r.capacity} riders</span>
                    <span className="font-mono">{r.utilization}%</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-t border-border text-left text-ink-muted uppercase tracking-wider">
                          <th className="px-4 py-2 font-medium">Name</th>
                          <th className="px-4 py-2 font-medium">Class / Role</th>
                          <th className="px-4 py-2 font-medium">Type</th>
                          <th className="px-4 py-2 font-medium">Pickup point</th>
                          <th className="px-4 py-2 font-medium text-right">Pickup time</th>
                          <th className="px-4 py-2 font-medium text-right">Pickup duration</th>
                          <th className="px-4 py-2 font-medium">Drop point</th>
                          <th className="px-4 py-2 font-medium text-right">Drop time</th>
                          <th className="px-4 py-2 font-medium text-right">Drop duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.roster.map((s) => (
                          <tr key={s.studentId} className="border-t border-border/40 hover:bg-panel2/40">
                            <td className="px-4 py-2">{s.name}</td>
                            <td className="px-4 py-2 font-mono text-ink-muted">{s.classOrDesignation}</td>
                            <td className="px-4 py-2">
                              <span
                                className={`route-chip ${
                                  s.userType === 'Student'
                                    ? 'border-amber/30 text-amber bg-amber/10'
                                    : 'border-teal/30 text-teal bg-teal/10'
                                }`}
                              >
                                {s.userType}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-ink-muted">{s.pickStop}</td>
                            <td className="px-4 py-2 text-right font-mono">{s.pickupTime ?? '—'}</td>
                            <td className="px-4 py-2 text-right font-mono text-ink-muted">{s.pickupDurationMinutes ?? '—'}m</td>
                            <td className="px-4 py-2 text-ink-muted">{s.dropStop}</td>
                            <td className="px-4 py-2 text-right font-mono">{s.dropTime ?? '—'}</td>
                            <td className="px-4 py-2 text-right font-mono text-ink-muted">{s.dropDurationMinutes ?? '—'}m</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
