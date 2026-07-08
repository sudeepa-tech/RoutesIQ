export default function StatCard({ label, value, unit, accent = 'ink', delta, icon: Icon }) {
  const accentClass = {
    amber: 'text-amber',
    teal: 'text-teal',
    coral: 'text-coral',
    ink: 'text-ink',
  }[accent];

  return (
    <div className="panel p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-ink-muted">{label}</span>
        {Icon && <Icon size={14} className="text-ink-faint" />}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`stat-figure text-2xl font-semibold ${accentClass}`}>{value}</span>
        {unit && <span className="text-xs text-ink-muted">{unit}</span>}
      </div>
      {delta && (
        <span className={`text-xs font-mono ${delta.startsWith('-') ? 'text-coral' : 'text-teal'}`}>
          {delta}
        </span>
      )}
    </div>
  );
}
