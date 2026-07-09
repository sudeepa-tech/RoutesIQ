import { NavLink } from 'react-router-dom';
import { LayoutGrid, Route, Map, Sparkles, Users, BusFront, FileBarChart, PiggyBank } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/routes', label: 'Routes', icon: Route },
  { to: '/map', label: 'Live Map', icon: Map },
  { to: '/optimizer', label: 'Optimizer', icon: Sparkles },
  { to: '/riders', label: 'Riders', icon: Users },
  { to: '/report', label: 'Report', icon: FileBarChart },
  { to: '/consolidation', label: 'AI Suggestions', icon: PiggyBank },
];

export default function Sidebar() {
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-amber/15 border border-amber/30 flex items-center justify-center">
          <BusFront size={18} className="text-amber" />
        </div>
        <div>
          <div className="font-display font-semibold text-sm tracking-wide">RouteIQ</div>
          <div className="text-[10px] text-ink-muted font-mono -mt-0.5">FLEET CONTROL</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-panel2 text-ink border border-border'
                  : 'text-ink-muted hover:text-ink hover:bg-panel2/60 border border-transparent'
              }`
            }
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-border">
        <div className="text-[11px] text-ink-faint font-mono leading-relaxed">
          Capacitated clustering
          <br />+ 2-opt sequencing engine
        </div>
      </div>
    </aside>
  );
}
