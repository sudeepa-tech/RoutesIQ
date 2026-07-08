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

  useEffect(() => {
    refreshStats().catch(() => {});
  }, [refreshStats]);

  const handleRun = async () => {
    setPhase('clustering');
    const clusterTimer = setTimeout(() => setPhase('sequencing'), 500);
    try {
      await runOptimization();
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
        <div className="panel p-6 flex items-center justify-between flex-wrap gap-4">
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
