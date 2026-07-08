export default function RouteTable({ plans, vehicles }) {
  const rows = plans?.length
    ? plans
    : vehicles?.map((v) => ({ vehicle: v, riders: null, distanceKm: null, utilization: null, stops: [] }));

  if (!rows?.length) {
    return (
      <div className="panel p-8 text-center text-ink-muted text-sm">
        No route data yet — upload a workbook to get started.
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-ink-muted text-xs uppercase tracking-wider">
            <th className="px-4 py-3 font-medium">Route</th>
            <th className="px-4 py-3 font-medium">Vehicle</th>
            <th className="px-4 py-3 font-medium">Start</th>
            <th className="px-4 py-3 font-medium text-right">Capacity</th>
            <th className="px-4 py-3 font-medium text-right">Riders</th>
            <th className="px-4 py-3 font-medium text-right">Utilization</th>
            <th className="px-4 py-3 font-medium text-right">Distance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const v = row.vehicle;
            const util = row.utilization;
            const utilColor =
              util == null ? 'text-ink-muted' : util > 95 ? 'text-coral' : util > 70 ? 'text-teal' : 'text-amber';
            return (
              <tr key={v.id} className="border-b border-border/60 last:border-0 hover:bg-panel2/40 transition-colors">
                <td className="px-4 py-2.5">
                  <span className="route-chip border-amber/30 text-amber bg-amber/10">{v.routeNo}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{v.vehicleNo}</td>
                <td className="px-4 py-2.5 text-ink-muted">{v.startPoint}</td>
                <td className="px-4 py-2.5 text-right font-mono">{v.capacity}</td>
                <td className="px-4 py-2.5 text-right font-mono">{row.riders ?? '—'}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${utilColor}`}>
                  {util != null ? `${util}%` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono">
                  {row.distanceKm != null ? `${row.distanceKm} km` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
