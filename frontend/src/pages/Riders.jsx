import { useEffect, useState } from 'react';
import Topbar from '../components/Topbar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import api from '../services/api.js';
import { useTransportData } from '../hooks/useTransportData.jsx';

export default function Riders() {
  const { stats, refreshStats } = useTransportData();
  const [riders, setRiders] = useState([]);
  const [query, setQuery] = useState('');
  const [userType, setUserType] = useState('');

  useEffect(() => {
    refreshStats().catch(() => {});
  }, [refreshStats]);

  useEffect(() => {
    if (!stats?.datasetLoaded) return;
    const t = setTimeout(() => {
      api.getRiders({ q: query || undefined, userType: userType || undefined }).then((d) => setRiders(d.riders));
    }, 250);
    return () => clearTimeout(t);
  }, [query, userType, stats?.datasetLoaded]);

  if (!stats?.datasetLoaded) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Riders" subtitle="Students & staff" />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <Topbar title="Riders" subtitle={`${stats.riders.toLocaleString()} total`} />
      <div className="p-6 space-y-4">
        <div className="flex gap-3 flex-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="flex-1 min-w-[200px] max-w-sm bg-panel border border-border rounded-lg px-3 py-2 text-sm placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-teal"
          />
          <select
            value={userType}
            onChange={(e) => setUserType(e.target.value)}
            className="bg-panel border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
          >
            <option value="">All types</option>
            <option value="Student">Student</option>
            <option value="Staff">Staff</option>
          </select>
        </div>

        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Class / Role</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Pick stop</th>
              </tr>
            </thead>
            <tbody>
              {riders.slice(0, 200).map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-panel2/40">
                  <td className="px-4 py-2.5">{r.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{r.classOrDesignation}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`route-chip ${
                        r.userType === 'Student'
                          ? 'border-amber/30 text-amber bg-amber/10'
                          : 'border-teal/30 text-teal bg-teal/10'
                      }`}
                    >
                      {r.userType}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">{r.pickStop}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {riders.length > 200 && (
            <div className="px-4 py-3 text-xs text-ink-faint font-mono border-t border-border">
              Showing first 200 of {riders.length} results — refine search to narrow down.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
