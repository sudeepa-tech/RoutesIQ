import { useEffect, useState } from 'react';
import { Download, Search } from 'lucide-react';
import Topbar from '../components/Topbar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useTransportData } from '../hooks/useTransportData.jsx';
import api from '../services/api.js';

export default function RouteRoster() {
  const { stats, refreshStats } = useTransportData();
  const [basis, setBasis] = useState('current');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [expandedRoute, setExpandedRoute] = useState(null);

  useEffect(() => {
    refreshStats().catch(() => {});
  }, [refreshStats]);

  const load = async (b) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getRouteRoster(b);
      setData(res);
      if (res.routes.length) setExpandedRoute(res.routes[0].routeNo);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (stats?.datasetLoaded) load(basis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.datasetLoaded, basis]);

  if (!stats?.datasetLoaded) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Route Roster" subtitle="All students & staff by route" />
        <EmptyState />
      </div>
    );
  }

  const filteredRoutes =
    data?.routes
      .map((r) => ({
        ...r,
        roster: query ? r.roster.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())) : r.roster,
      }))
      .filter((r) => !query || r.roster.length > 0) ?? [];

  const exportCsv = () => {
    if (!data) return;
    const header = ['Route No', 'Vehicle No', 'Status', 'Student Name', 'Class/Role', 'Type', 'Pick Stop'];
    const lines = [];
    for (const r of data.routes) {
      for (const s of r.roster) {
        lines.push([r.routeNo, r.vehicleNo, r.status, s.name, s.classOrDesignation, s.userType, s.pickStop].join(','));
      }
    }
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `route-roster-${basis}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <Topbar
        title="Route Roster"
        subtitle={data ? `${data.routeCount} routes · ${data.totalRoster.toLocaleString()} riders` : 'All students & staff by route'}
      />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            {[
              ['current', 'Current routes'],
              ['suggested', 'After AI suggestions'],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setBasis(id)}
                className={`text-sm font-medium px-3 py-1.5 rounded-lg border transition ${
                  basis === id
                    ? 'bg-panel2 text-ink border-border'
                    : 'text-ink-muted border-transparent hover:text-ink hover:bg-panel2/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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
              onClick={exportCsv}
              disabled={!data}
              className="flex items-center gap-2 text-sm font-medium bg-panel2 border border-border px-3.5 py-2 rounded-lg hover:bg-panel transition disabled:opacity-50"
            >
              <Download size={15} />
              Export CSV
            </button>
          </div>
        </div>

        {loading && <div className="panel p-8 text-center text-ink-muted text-sm">Loading roster…</div>}

        {error && (
          <div className="panel p-6 text-center text-sm text-ink-muted">
            <p className="mb-1">{error}</p>
            {basis === 'suggested' && (
              <p className="text-xs text-ink-faint">Run the optimizer, then AI Suggestions, then come back here.</p>
            )}
          </div>
        )}

        {!loading && data && (
          <div className="space-y-3">
            {filteredRoutes.map((r) => (
              <div key={r.routeNo} className="panel overflow-hidden">
                <button
                  onClick={() => setExpandedRoute(expandedRoute === r.routeNo ? null : r.routeNo)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-panel2/40 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="route-chip border-amber/30 text-amber bg-amber/10">{r.routeNo}</span>
                    <span className="font-mono text-xs text-ink-muted">{r.vehicleNo}</span>
                    {r.status === 'merged' && (
                      <span className="text-xs text-teal font-medium">merged from {r.mergedFrom.join(', ')}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-ink-muted">
                    <span>
                      {r.riderCount}/{r.capacity} riders
                    </span>
                    <span className="font-mono">{r.utilization}%</span>
                    <span>{r.roster.length} listed</span>
                  </div>
                </button>
                {expandedRoute === r.routeNo && (
                  <table className="w-full text-sm border-t border-border">
                    <thead>
                      <tr className="border-b border-border text-left text-ink-muted text-xs uppercase tracking-wider">
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-4 py-2 font-medium">Class / Role</th>
                        <th className="px-4 py-2 font-medium">Type</th>
                        <th className="px-4 py-2 font-medium">Pick stop</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.roster.map((s) => (
                        <tr key={s.studentId} className="border-b border-border/60 last:border-0 hover:bg-panel2/40">
                          <td className="px-4 py-2">{s.name}</td>
                          <td className="px-4 py-2 font-mono text-xs text-ink-muted">{s.classOrDesignation}</td>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
