import { Shield, LayoutDashboard, Users, ListChecks, Scale, DollarSign } from 'lucide-react';
import type { Route } from '@/lib/router';
import { routeToHash } from '@/lib/router';

const NAV: { route: Route; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { route: { name: 'dashboard' }, label: 'Dashboard', icon: LayoutDashboard },
  { route: { name: 'customers' }, label: 'Customer Reviews', icon: Users },
  { route: { name: 'queue' }, label: 'Review Queue', icon: ListChecks },
  { route: { name: 'tos-rules' }, label: 'TOS Rules', icon: Scale },
  { route: { name: 'damages' }, label: 'Damages', icon: DollarSign },
];

export function Sidebar({ route }: { route: Route }) {
  const isActive = (r: Route) => {
    if (r.name === 'customers' && route.name === 'customer') return true;
    return r.name === route.name;
  };

  return (
    <aside className="w-60 shrink-0 border-r border-slate-800 bg-slate-950/80 flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
            <Shield size={20} />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100 leading-tight">ChicksX</h1>
            <p className="text-xs text-slate-500 leading-tight">TOS Review Dashboard</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const active = isActive(item.route);
          const Icon = item.icon;
          return (
            <a
              key={item.label}
              href={routeToHash(item.route)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                active
                  ? 'bg-sky-500/10 text-sky-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </a>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-slate-800">
        <p className="text-xs text-slate-600">Internal compliance tool</p>
        <p className="text-xs text-slate-600 mt-0.5">Reviewer: Compliance Team</p>
      </div>
    </aside>
  );
}
