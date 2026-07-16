import { useEffect, useState } from 'react';
import { Download, Users, Clock, Bus } from 'lucide-react';
import * as XLSX from 'xlsx';
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
  const [view, setView] = useState('pickup'); // pickup | drop

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
        <Topbar title="Impacted Students" subtitle="Who changed vehicles, and their new schedule" />
        <EmptyState />
      </div>
    );
  }

  const exportPickupXlsx = () => {
    if (!report) return;
    const rows = report.rows.map((r) => ({
      Student: r.studentName,
      'Class/Role': r.classOrDesignation,
      Type: r.userType,
      'Pick Stop': r.pickStop,
      'Old Route': r.oldRouteNo,
      'Old Vehicle': r.oldVehicleNo,
      'New Route': r.newRouteNo,
      'New Vehicle': r.newVehicleNo,
      'Old Pickup Time': r.oldPickupTime,
      'Old Pickup Duration (min)': r.oldPickupDurationMinutes,
      'New Pickup Time': r.newPickupTime,
      'New Pickup Duration (min)': r.newPickupDurationMinutes,
    }));
    downloadXlsx(rows, 'Morning Pickup', 'impacted-students-morning-pickup');
  };

  const exportDropXlsx = () => {
    if (!report) return;
    const rows = report.rows.map((r) => ({
      Student: r.studentName,
      'Class/Role': r.classOrDesignation,
      Type: r.userType,
      'Pick Stop': r.pickStop,
      'Old Route': r.oldRouteNo,
      'Old Vehicle': r.oldVehicleNo,
      'New Route': r.newRouteNo,
      'New Vehicle': r.newVehicleNo,
      'Old Drop Time': r.oldDropTime,
      'Old Drop Duration (min)': r.oldDropDurationMinutes,
      'New Drop Time': r.newDropTime,
      'New Drop Duration (min)': r.newDropDurationMinutes,
    }));
    downloadXlsx(rows, 'Afternoon Drop', 'impacted-students-afternoon-drop');
  };

  const downloadXlsx = (rows, sheetName, filenamePrefix) => {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    // reasonable column widths so it's readable without manual resizing
    worksheet['!cols'] = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key] ?? '').length)) + 2,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const deltaColor = (oldV, newV) => {
    if (oldV == null || newV == null) return 'text-ink-muted';
    if (newV < oldV) return 'text-teal';
    if (newV > oldV) return 'text-coral';
    return 'text-ink-muted';
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <Topbar title="Impacted Students" subtitle="Who changed vehicles, and their new schedule" />
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
                These riders' vehicle assignment changed because of the last consolidation run. Every bus
                still reaches campus at exactly <strong className="text-ink">{report.schoolArrivalTime}</strong> and
                leaves at <strong className="text-ink">{report.schoolDepartureTime}</strong> — only each
                student's own pickup/drop time on their new route shifts.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportPickupXlsx}
                  className="flex items-center gap-2 text-sm font-medium bg-panel2 border border-border px-3.5 py-2 rounded-lg hover:bg-panel transition"
                >
                  <Download size={15} />
                  Export morning pickup (.xlsx)
                </button>
                <button
                  onClick={exportDropXlsx}
                  className="flex items-center gap-2 text-sm font-medium bg-panel2 border border-border px-3.5 py-2 rounded-lg hover:bg-panel transition"
                >
                  <Download size={15} />
                  Export afternoon drop (.xlsx)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard label="Students impacted" value={report.count} icon={Users} accent="amber" />
              <StatCard label="Route groups affected" value={report.groupsAffected} icon={Bus} accent="teal" />
              <StatCard label="Report generated" value={new Date(report.computedAt).toLocaleTimeString()} icon={Clock} accent="ink" />
            </div>

            <div className="flex gap-2">
              {[
                ['pickup', 'Morning pickup'],
                ['drop', 'Afternoon drop'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={`text-sm font-medium px-3 py-1.5 rounded-lg border transition ${
                    view === id
                      ? 'bg-panel2 text-ink border-border'
                      : 'text-ink-muted border-transparent hover:text-ink hover:bg-panel2/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="panel overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Old vehicle</th>
                    <th className="px-4 py-3 font-medium">New vehicle</th>
                    {view === 'pickup' ? (
                      <>
                        <th className="px-4 py-3 font-medium text-right">Old pickup</th>
                        <th className="px-4 py-3 font-medium text-right">Old duration</th>
                        <th className="px-4 py-3 font-medium text-right">New pickup</th>
                        <th className="px-4 py-3 font-medium text-right">New duration</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 font-medium text-right">Old drop</th>
                        <th className="px-4 py-3 font-medium text-right">Old duration</th>
                        <th className="px-4 py-3 font-medium text-right">New drop</th>
                        <th className="px-4 py-3 font-medium text-right">New duration</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.studentId} className="border-b border-border/60 last:border-0 hover:bg-panel2/40">
                      <td className="px-4 py-2.5">
                        <div>{r.studentName}</div>
                        <div className="text-xs text-ink-muted font-mono">{r.classOrDesignation} · {r.pickStop}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="route-chip border-coral/30 text-coral bg-coral/10">{r.oldRouteNo}</span>
                        <span className="ml-1.5 font-mono text-xs text-ink-muted">{r.oldVehicleNo}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="route-chip border-teal/30 text-teal bg-teal/10">{r.newRouteNo}</span>
                        <span className="ml-1.5 font-mono text-xs text-ink-muted">{r.newVehicleNo}</span>
                      </td>
                      {view === 'pickup' ? (
                        <>
                          <td className="px-4 py-2.5 text-right font-mono text-ink-muted">{r.oldPickupTime ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-ink-muted">{r.oldPickupDurationMinutes ?? '—'}m</td>
                          <td className="px-4 py-2.5 text-right font-mono">{r.newPickupTime ?? '—'}</td>
                          <td className={`px-4 py-2.5 text-right font-mono ${deltaColor(r.oldPickupDurationMinutes, r.newPickupDurationMinutes)}`}>
                            {r.newPickupDurationMinutes ?? '—'}m
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 text-right font-mono text-ink-muted">{r.oldDropTime ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-ink-muted">{r.oldDropDurationMinutes ?? '—'}m</td>
                          <td className="px-4 py-2.5 text-right font-mono">{r.newDropTime ?? '—'}</td>
                          <td className={`px-4 py-2.5 text-right font-mono ${deltaColor(r.oldDropDurationMinutes, r.newDropDurationMinutes)}`}>
                            {r.newDropDurationMinutes ?? '—'}m
                          </td>
                        </>
                      )}
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
