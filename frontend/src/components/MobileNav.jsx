import { NavLink } from 'react-router-dom';
import { LayoutGrid, Route, Sparkles, FileBarChart, PiggyBank } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Home', icon: LayoutGrid, end: true },
  { to: '/routes', label: 'Routes', icon: Route },
  { to: '/optimizer', label: 'Optimize', icon: Sparkles },
  { to: '/report', label: 'Report', icon: FileBarChart },
  { to: '/consolidation', label: 'AI Tips', icon: PiggyBank },
];

export default function MobileNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-[1100] bg-panel border-t border-border flex justify-around py-2">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium ${
              isActive ? 'text-amber' : 'text-ink-muted'
            }`
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
