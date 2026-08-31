import type { LucideIcon } from 'lucide-react';

export function StatCard({
  label, value, icon: Icon, color = 'sky', sub,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: string;
  sub?: string;
}) {
  const colorMap: Record<string, string> = {
    sky: 'text-sky-400 bg-sky-500/10',
    red: 'text-red-400 bg-red-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/10',
    slate: 'text-slate-400 bg-slate-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
  };
  return (
    <div className="card card-hover p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-400">{label}</span>
        <div className={`p-2 rounded-lg ${colorMap[color] ?? colorMap.sky}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
