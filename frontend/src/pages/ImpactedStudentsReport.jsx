import { useEffect, useState } from 'react';
import { Download, Users, Clock, Bus } from 'lucide-react';
import Topbar from '../components/Topbar.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useTransportData } from '../hooks/useTransportData.jsx';
import api from '../services/api.js';

export default function ImpactedStudentsReport() {
  const { stats, refreshStats } = useTransportData();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    refreshStats().catch(() => {});
  }, [refreshStats]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getImpactedStudents();
      setReport(data);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
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
        <Topbar title="Impacted Students" subtitle="Who changed vehicles, and when they'll be picked up" />
        <EmptyState />
      </div>
    );
  }

  const exportCsv = () => {
    if (!report) return;
    const header = ['Student', 'Class/Role', 'Type', 'Pick Stop', 'Old Route', 'Old Vehicle', 'New Route', 'New Vehicle', 'Estimated Pickup Time'];
    const lines = report.rows.map((r) =>
      [r.studentName, r.classOrDesignation, r.userType, r.pickStop, r.oldRouteNo, r.oldVehicleNo, r.newRouteNo, r.newVehicleNo, r.estimatedPickupTime].join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `impacted-students-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <Topbar title="Impacted Students" subtitle="Who changed vehicles, and when they'll be picked up" />
      <div className="p-6 space-y-6">
        {loading && <div className="panel p-6 text-center text-ink-muted text-sm">Loading report…</div>}

        {error && (
          <div className="panel p-6 text-center text-sm text-ink-muted">
            <p className="mb-1">{error}</p>
            <p className="text-xs text-ink-faint">
              Run the optimizer, then generate AI suggestions on the AI Suggestions tab, then come back here.
            </p>
          </div>
        )}

        {report && !loading && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-ink-muted max-w-xl">
                These riders' vehicle assignment changed because of the last consolidation run — share this
                with parents/transport staff ahead of the switch.
              </p>
              <button
                onClick={exportCsv}
                className="flex items-center gap-2 text-sm font-medium bg-panel2 border border-border px-3.5 py-2 rounded-lg hover:bg-panel transition"
              >
                <Download size={15} />
                Export CSV
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard label="Students impacted" value={report.count} icon={Users} accent="amber" />
              <StatCard label="Route groups affected" value={report.groupsAffected} icon={Bus} accent="teal" />
              <StatCard
                label="Report generated"
                value={new Date(report.computedAt).toLocaleTimeString()}
                icon={Clock}
                accent="ink"
              />
            </div>

            <div className="panel overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Class / Role</th>
                    <th className="px-4 py-3 font-medium">Pick stop</th>
                    <th className="px-4 py-3 font-medium">Old vehicle</th>
                    <th className="px-4 py-3 font-medium">New vehicle</th>
                    <th className="px-4 py-3 font-medium text-right">Pickup time</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.studentId} className="border-b border-border/60 last:border-0 hover:bg-panel2/40">
                      <td className="px-4 py-2.5">{r.studentName}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{r.classOrDesignation}</td>
                      <td className="px-4 py-2.5 text-ink-muted">{r.pickStop}</td>
                      <td className="px-4 py-2.5">
                        <span className="route-chip border-coral/30 text-coral bg-coral/10">{r.oldRouteNo}</span>
                        <span className="ml-1.5 font-mono text-xs text-ink-muted">{r.oldVehicleNo}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="route-chip border-teal/30 text-teal bg-teal/10">{r.newRouteNo}</span>
                        <span className="ml-1.5 font-mono text-xs text-ink-muted">{r.newVehicleNo}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.estimatedPickupTime ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
