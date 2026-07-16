import { useEffect, useState } from 'react';
import { Sparkles, Loader2, TrendingDown, BusFront, Users, Gauge } from 'lucide-react';
import Topbar from '../components/Topbar.jsx';
import StatCard from '../components/StatCard.jsx';
import RouteTable from '../components/RouteTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useTransportData } from '../hooks/useTransportData.jsx';

export default function Optimizer() {
  const { stats, optimization, runOptimization, loading, refreshStats, error } = useTransportData();
  const [phase, setPhase] = useState('idle'); // idle | clustering | sequencing | done
  const [targetUtilizationPct, setTargetUtilizationPct] = useState(100);

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
          <strong className="text-ink">05:30</strong> (a max 105-minute ride) — routes are automatically
          reshuffled to enforce this, moving stops between vehicles no more than <strong className="text-ink">12 km</strong> apart.
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

            {summary.routesStillOverRideDuration?.length > 0 && (
              <div className="bg-coral/10 border border-coral/30 text-coral text-xs px-4 py-3 rounded-lg font-mono space-y-1">
                <div>
                  {summary.routesStillOverRideDuration.length} route(s) still need a pickup before 05:30 —
                  the fleet was reshuffled to minimize this, but these routes have no geographically feasible
                  vehicle (within the merge distance cap) to offload their farthest stop to:
                </div>
                <div className="text-ink-muted">
                  {summary.routesStillOverRideDuration.map((r) => `${r.routeNo} (${r.worstDurationMinutes}m ride)`).join(', ')}
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
