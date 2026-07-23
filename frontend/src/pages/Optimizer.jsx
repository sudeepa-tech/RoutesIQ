import { useEffect, useState } from 'react';
import { Sparkles, Loader2, TrendingDown, BusFront, Users, Gauge, ChevronDown, ChevronRight, Download, PlusCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import Topbar from '../components/Topbar.jsx';
import StatCard from '../components/StatCard.jsx';
import RouteTable from '../components/RouteTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useTransportData } from '../hooks/useTransportData.jsx';

export default function Optimizer() {
  const { stats, optimization, runOptimization, loading, refreshStats, error } = useTransportData();
  const [phase, setPhase] = useState('idle'); // idle | clustering | sequencing | done
  const [targetUtilizationPct, setTargetUtilizationPct] = useState(100);
  const [expandedNewRoute, setExpandedNewRoute] = useState(null);

  useEffect(() => {
    refreshStats().catch(() => {});
  }, [refreshStats]);

  const handleRun = async () => {
    setPhase('clustering');
    const clusterTimer = setTimeout(() => setPhase('sequencing'), 500);
    try {
      await runOptimization({ targetUtilizationPct });
      setPhase('done');
    } catch {
      setPhase('idle');
    } finally {
      clearTimeout(clusterTimer);
    }
  };

  if (!stats?.datasetLoaded) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Optimizer" subtitle="Capacitated clustering + 2-opt sequencing" />
        <EmptyState />
      </div>
    );
  }

  const summary = optimization?.summary;
  const newRoutes = summary?.suggestedNewRoutes ?? [];

  const exportNewRoutesXlsx = () => {
    const rows = [];
    for (const nr of newRoutes) {
      for (const s of nr.roster) {
        rows.push({
          'Suggested Route': nr.suggestedRouteNo,
          'Suggested Capacity': nr.suggestedCapacity,
          'Riders': nr.riders,
          'Suggested Start Time': nr.routeStartTime,
          'Meets Constraint': nr.meetsConstraint ? 'Yes' : 'No — needs earlier start',
          'Student': s.name,
          'Class/Role': s.classOrDesignation,
          'Type': s.userType,
          'Pick Stop': s.pickStop,
        });
      }
    }
    if (!rows.length) return;
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = Object.keys(rows[0]).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key] ?? '').length)) + 2,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Suggested New Routes');
    XLSX.writeFile(workbook, `suggested-new-routes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <Topbar title="Optimizer" subtitle="Capacitated clustering + 2-opt sequencing" />
      <div className="p-6 space-y-6">
        <div className="panel p-6">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
            <div>
              <h2 className="font-display font-medium mb-1">Run route optimization</h2>
              <p className="text-sm text-ink-muted max-w-xl">
                Clusters {stats.stops} pickup stops across {stats.vehicles} vehicles by capacity and
                geography, then sequences each route with nearest-neighbour + 2-opt to minimize
                distance back to campus.
              </p>
            </div>
            <button
              onClick={handleRun}
              disabled={loading}
              className="flex items-center gap-2 bg-teal text-base font-medium px-5 py-2.5 rounded-lg hover:brightness-110 active:brightness-95 transition disabled:opacity-60 shrink-0"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? phase === 'clustering' ? 'Clustering stops…' : 'Sequencing routes…' : 'Run optimizer'}
            </button>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="utilCap" className="text-xs uppercase tracking-wide text-ink-muted">
                Target utilization cap per vehicle
              </label>
              <span className="font-mono text-sm text-amber">{targetUtilizationPct}%</span>
            </div>
            <input
              id="utilCap"
              type="range"
              min={50}
              max={100}
              step={5}
              value={targetUtilizationPct}
              onChange={(e) => setTargetUtilizationPct(Number(e.target.value))}
              className="w-full accent-amber"
            />
            <p className="text-xs text-ink-faint mt-2 leading-relaxed">
              Buses are filled up to this % of their real seat capacity as a target — never over
              100%. If the cap is too tight to seat everyone, it's relaxed automatically per bus
              (never beyond true capacity) so no rider is left without a seat.
            </p>
          </div>
        </div>

        <div className="panel p-4 font-mono text-xs text-ink-muted">
          🕐 Every route reaches campus at exactly <strong className="text-ink">07:15</strong> for pickup and
          leaves at exactly <strong className="text-ink">14:20</strong> for drop. No pickup happens before{' '}
          <strong className="text-ink">06:00</strong>, and no student rides longer than{' '}
          <strong className="text-ink">80 minutes</strong> (the stricter of the two wins — currently{' '}
          {summary ? <strong className="text-ink">{summary.maxRideDurationMinutes} min</strong> : '75 min'}). Existing
          routes are reshuffled first (moving stops up to <strong className="text-ink">12 km</strong> apart); anything
          that still can't be placed is proposed as a brand-new route below.
        </div>

        {error && (
          <div className="bg-coral/10 border border-coral/40 text-coral text-sm px-4 py-3 rounded-lg font-mono">
            {error}
          </div>
        )}

        {summary && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Vehicles used" value={`${summary.vehiclesUsed}/${summary.vehiclesAvailable}`} icon={BusFront} accent="amber" />
              <StatCard label="Riders routed" value={summary.totalRiders.toLocaleString()} icon={Users} />
              <StatCard label="Fleet utilization" value={summary.fleetUtilization} unit="%" icon={Gauge} accent="teal" />
              <StatCard
                label="Distance saved"
                value={summary.distanceSavedPct}
                unit="%"
                icon={TrendingDown}
                accent="teal"
                delta={`${summary.distanceSavedKm} km saved`}
              />
            </div>

            {summary.vehiclesOverTargetCap > 0 && (
              <div className="bg-amber/10 border border-amber/30 text-amber text-xs px-4 py-3 rounded-lg font-mono">
                {summary.vehiclesOverTargetCap} vehicle(s) were filled to full capacity (above the {summary.targetUtilizationCapPct}% target)
                because the target alone couldn't seat every rider — no vehicle ever exceeds its real seat capacity.
              </div>
            )}

            {newRoutes.length > 0 && (
              <div className="panel p-5 border-amber/30">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <PlusCircle size={16} className="text-amber" />
                    <h3 className="font-display font-medium text-sm">
                      {newRoutes.length} new vehicle{newRoutes.length > 1 ? 's' : ''} needed
                    </h3>
                  </div>
                  <button
                    onClick={exportNewRoutesXlsx}
                    className="flex items-center gap-2 text-xs font-medium bg-panel2 border border-border px-3 py-1.5 rounded-lg hover:bg-panel transition"
                  >
                    <Download size={13} />
                    Export .xlsx
                  </button>
                </div>
                <p className="text-xs text-ink-muted mb-4 max-w-2xl">
                  These riders couldn't be placed on any existing vehicle within the 06:00 / 80-minute
                  constraint, even after reshuffling. Each card below is a proposed new route — click to
                  see the full student/staff list and suggested pickup schedule.
                </p>
                <div className="space-y-2">
                  {newRoutes.map((nr) => {
                    const isExpanded = expandedNewRoute === nr.suggestedRouteNo;
                    return (
                      <div key={nr.suggestedRouteNo} className="border border-border rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedNewRoute(isExpanded ? null : nr.suggestedRouteNo)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-panel2/40 transition"
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? <ChevronDown size={14} className="text-ink-faint" /> : <ChevronRight size={14} className="text-ink-faint" />}
                            <span className="route-chip border-amber/30 text-amber bg-amber/10">{nr.suggestedRouteNo}</span>
                            <span className="text-xs text-ink-muted">
                              {nr.riders}/{nr.suggestedCapacity} riders · starts {nr.routeStartTime}
                            </span>
                            {!nr.meetsConstraint && (
                              <span className="text-xs text-coral font-medium">
                                needs {nr.worstDurationMinutes}m ride — still before 06:00
                              </span>
                            )}
                          </div>
                        </button>
                        {isExpanded && (
                          <table className="w-full text-xs border-t border-border">
                            <thead>
                              <tr className="text-left text-ink-muted uppercase tracking-wider">
                                <th className="px-4 py-2 font-medium">Name</th>
                                <th className="px-4 py-2 font-medium">Class / Role</th>
                                <th className="px-4 py-2 font-medium">Type</th>
                                <th className="px-4 py-2 font-medium">Pick stop</th>
                              </tr>
                            </thead>
                            <tbody>
                              {nr.roster.map((s) => (
                                <tr key={s.studentId} className="border-t border-border/40">
                                  <td className="px-4 py-1.5">{s.name}</td>
                                  <td className="px-4 py-1.5 font-mono text-ink-muted">{s.classOrDesignation}</td>
                                  <td className="px-4 py-1.5">
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
                                  <td className="px-4 py-1.5 text-ink-muted">{s.pickStop}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="panel p-5">
              <h3 className="font-display font-medium text-sm mb-4">Baseline vs optimized distance</h3>
              <DistanceBar label="Naive assignment (baseline)" km={summary.baselineDistanceKm} max={summary.baselineDistanceKm} color="bg-coral" />
              <DistanceBar label="AI-optimized routes" km={summary.optimizedDistanceKm} max={summary.baselineDistanceKm} color="bg-teal" />
            </div>

            <RouteTable plans={optimization.plans} />
          </>
        )}
      </div>
    </div>
  );
}

function DistanceBar({ label, km, max, color }) {
  const pct = Math.max(4, Math.round((km / max) * 100));
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-ink-muted">{label}</span>
        <span className="font-mono">{km.toLocaleString()} km</span>
      </div>
      <div className="h-3 bg-panel2 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-700 ease-out`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
