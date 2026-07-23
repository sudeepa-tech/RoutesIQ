import { useEffect, useState } from 'react';
import { Sparkles, Loader2, PiggyBank, BusFront, TrendingDown, IndianRupee } from 'lucide-react';
import Topbar from '../components/Topbar.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useTransportData } from '../hooks/useTransportData.jsx';

const DEFAULTS = {
  utilizationThreshold: 70,
  maxMergeDistanceKm: 12,
  minCombinedUtilization: 90,
  costPerVehiclePerMonth: 45000,
  fuelCostPerKm: 18,
  tripsPerDay: 2,
  operatingDaysPerMonth: 22,
};

const fmtINR = (n) => `\u20B9${Number(n).toLocaleString('en-IN')}`;

export default function ConsolidationReport() {
  const { stats, optimization, consolidation, runConsolidation, loading, error, refreshStats } = useTransportData();
  const [form, setForm] = useState(DEFAULTS);
  const result = consolidation;

  useEffect(() => {
    refreshStats().catch(() => {});
  }, [refreshStats]);

  const update = (key) => (e) => {
    const value = Number(e.target.value);
    setForm((f) => ({ ...f, [key]: Number.isNaN(value) ? e.target.value : value }));
  };

  const handleRun = async () => {
    try {
      await runConsolidation(form);
    } catch {
      // error already captured in shared context state
    }
  };

  if (!stats?.datasetLoaded) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="AI Suggestions" subtitle="Route consolidation & ROI" />
        <EmptyState />
      </div>
    );
  }

  if (!optimization) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="AI Suggestions" subtitle="Route consolidation & ROI" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Sparkles size={28} className="text-ink-faint" />
          <h2 className="font-display font-medium">Run the optimizer first</h2>
          <p className="text-sm text-ink-muted max-w-sm">
            Consolidation suggestions are built on top of an optimized fleet plan — visit the
            Optimizer tab and run it once, then come back here.
          </p>
        </div>
      </div>
    );
  }

  const roi = result?.roi;
  const metrics = result?.metrics;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <Topbar title="AI Suggestions" subtitle="Route consolidation & ROI" />
      <div className="p-6 space-y-6">
        <div className="panel p-6">
          <h2 className="font-display font-medium mb-1">Consolidation parameters</h2>
          <p className="text-sm text-ink-muted mb-5 max-w-2xl">
            Buses under the utilization threshold are candidates to be merged into a nearby
            route with spare seats — e.g. a 70% full bus can absorb a 30% full one. Merges are
            only proposed within the max distance so routes stay realistic.
          </p>
          <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Field label="Merge below utilization %" value={form.utilizationThreshold} onChange={update('utilizationThreshold')} />
            <Field label="Full-load target % (min)" value={form.minCombinedUtilization} onChange={update('minCombinedUtilization')} />
            <Field label="Max merge distance (km)" value={form.maxMergeDistanceKm} onChange={update('maxMergeDistanceKm')} />
            <Field label="Cost / vehicle / month (₹)" value={form.costPerVehiclePerMonth} onChange={update('costPerVehiclePerMonth')} />
            <Field label="Fuel cost / km (₹)" value={form.fuelCostPerKm} onChange={update('fuelCostPerKm')} />
            <Field label="Trips / day" value={form.tripsPerDay} onChange={update('tripsPerDay')} />
            <Field label="Operating days / month" value={form.operatingDaysPerMonth} onChange={update('operatingDaysPerMonth')} />
          </div>
          <button
            onClick={handleRun}
            disabled={loading}
            className="mt-5 flex items-center gap-2 bg-amber text-base font-medium px-5 py-2.5 rounded-lg hover:brightness-110 active:brightness-95 transition disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? 'Analyzing routes…' : 'Generate AI suggestions'}
          </button>
        </div>

        {error && (
          <div className="bg-coral/10 border border-coral/40 text-coral text-sm px-4 py-3 rounded-lg font-mono">
            {error}
          </div>
        )}

        {result && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Vehicles freed" value={metrics.vehiclesFreedCount} icon={BusFront} accent="amber" delta={`of ${metrics.originalVehicleCount} routes`} />
              <StatCard label="Distance change" value={metrics.distanceDeltaKm} unit="km" icon={TrendingDown} accent={metrics.distanceDeltaKm <= 0 ? 'teal' : 'coral'} />
              <StatCard label="Fixed savings / month" value={fmtINR(roi.fixedMonthlySavings)} icon={PiggyBank} accent="teal" />
              <StatCard label="Total savings / year" value={fmtINR(roi.totalAnnualSavings)} icon={IndianRupee} accent="teal" delta={`incl. fuel: ${fmtINR(-roi.annualFuelDeltaCost)}`} />
            </div>

            <div className="panel p-4 text-sm">
              {metrics.vehiclesFreedCount > 0 ? (
                <span className="text-teal">
                  ✓ {metrics.vehiclesFreedCount} vehicle{metrics.vehiclesFreedCount > 1 ? 's' : ''} can be merged and freed up —
                  see the table below for exactly which routes combine.
                </span>
              ) : (
                <span className="text-ink-muted">
                  No vehicles can be merged right now — every under-utilized route is already too
                  geographically spread out (or too close to the pickup-time floor) to safely combine
                  with another without breaking the schedule constraints. This usually means the fleet
                  is already at its minimum size for the current time window, not that nothing is optimized.
                </span>
              )}
            </div>

            <div className="panel p-5">
              <h3 className="font-display font-medium text-sm mb-4">Suggested merges</h3>
              {result.suggestions.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No feasible merges found within the current thresholds — try lowering the
                  full-load target or raising the max merge distance.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-ink-muted text-xs uppercase tracking-wider">
                        <th className="px-3 py-2 font-medium">Merged routes</th>
                        <th className="px-3 py-2 font-medium">Into</th>
                        <th className="px-3 py-2 font-medium text-right">Combined util.</th>
                        <th className="px-3 py-2 font-medium text-right">Riders</th>
                        <th className="px-3 py-2 font-medium text-right">Route dist. Δ</th>
                        <th className="px-3 py-2 font-medium">Vehicles freed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.suggestions.map((s, i) => (
                        <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-panel2/40">
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
                              {s.mergedRoutes.map((r) => (
                                <span
                                  key={r}
                                  className={`route-chip ${
                                    r === s.intoRoute
                                      ? 'border-teal/30 text-teal bg-teal/10'
                                      : 'border-coral/30 text-coral bg-coral/10'
                                  }`}
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">{s.intoVehicle}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-teal">{s.combinedUtilizationPct}%</td>
                          <td className="px-3 py-2.5 text-right font-mono">{s.combinedRiders}</td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            {(s.distanceAfterKm - s.distanceBeforeKm).toFixed(1)} km
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">
                            {s.freedVehicles.map((v) => `${v.vehicleNo} (${v.capacity}-seat)`).join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="panel p-5 text-xs text-ink-faint font-mono leading-relaxed">
              Assumptions: {fmtINR(roi.assumptions.costPerVehiclePerMonth)}/vehicle/month (driver + lease +
              maintenance), {fmtINR(roi.assumptions.fuelCostPerKm)}/km fuel, {roi.assumptions.tripsPerDay} trips/day,{' '}
              {roi.assumptions.operatingDaysPerMonth} operating days/month — edit above and re-run to match
              your institute's actual costs.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] text-ink-muted uppercase tracking-wide">{label}</span>
      <input
        type="number"
        value={value}
        onChange={onChange}
        className="bg-panel2 border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-teal"
      />
    </label>
  );
}
