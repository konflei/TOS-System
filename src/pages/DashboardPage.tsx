import { useEffect, useState } from 'react';
import { Users, AlertTriangle, ShieldCheck, Clock, DollarSign, Scale, TrendingUp, Activity } from 'lucide-react';
import { getCustomers, getTransactions, getTosRules, getAllDamages, getAudit } from '@/lib/db';
import type { Customer, Transaction, TosRule, DamageAssessment, AuditLog } from '@/lib/types';
import { StatCard } from '@/components/ui/StatCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AssessmentBadge, HumanReviewBadge } from '@/components/ui/Badge';
import { money, dateTimeStr } from '@/lib/format';
import type { Route } from '@/lib/router';
import { routeToHash } from '@/lib/router';

export function DashboardPage({ navigate }: { navigate: (r: Route) => void }) {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rules, setRules] = useState<TosRule[]>([]);
  const [damages, setDamages] = useState<DamageAssessment[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [c, t, r, d, a] = await Promise.all([
          getCustomers(), getTransactions(), getTosRules(), getAllDamages(), getAudit(),
        ]);
        setCustomers(c); setTransactions(t); setRules(r); setDamages(d); setAudit(a);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner label="Loading dashboard…" />;

  const potential = customers.filter((c) => c.ai_assessment_status === 'Potential Violation').length;
  const confirmed = customers.filter((c) => c.ai_assessment_status === 'Confirmed Violation').length;
  const pending = customers.filter((c) => c.human_review_status === 'Pending').length;
  const totalDamages = damages.reduce((s, d) => s + Number(d.approved_damages), 0);
  const recovered = damages.reduce((s, d) => s + Number(d.amount_recovered), 0);
  const reviewed = customers.filter((c) => c.human_review_status !== 'Pending').length;

  const byStatus: Record<string, number> = {};
  customers.forEach((c) => { byStatus[c.ai_assessment_status] = (byStatus[c.ai_assessment_status] ?? 0) + 1; });

  const byRegion: Record<string, number> = {};
  customers.forEach((c) => { const r = c.region || 'Unknown'; byRegion[r] = (byRegion[r] ?? 0) + 1; });

  const totalTxnAmount = transactions.reduce((s, t) => s + Number(t.amount), 0);
  const flaggedTxns = transactions.filter((t) => t.tos_assessment_status === 'Potential Violation').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Dashboard</h2>
        <p className="text-sm text-slate-500 mt-1">Overview of TOS compliance review status across all customers</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Customers" value={customers.length} icon={Users} color="sky" sub={`${reviewed} reviewed`} />
        <StatCard label="Potential Violations" value={potential + confirmed} icon={AlertTriangle} color="amber" sub={`${confirmed} confirmed`} />
        <StatCard label="Pending Review" value={pending} icon={Clock} color="red" sub="Awaiting human decision" />
        <StatCard label="Approved Damages" value={money(totalDamages)} icon={DollarSign} color="emerald" sub={`${money(recovered)} recovered`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Activity size={16} className="text-sky-400" />
              Assessment Status Breakdown
            </h3>
          </div>
          <div className="space-y-3">
            {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
              const pct = customers.length > 0 ? (count / customers.length) * 100 : 0;
              const barColor: Record<string, string> = {
                'Potential Violation': 'bg-amber-500',
                'Confirmed Violation': 'bg-red-500',
                'Needs Review': 'bg-sky-500',
                'No Violation': 'bg-emerald-500',
                'Not Assessed': 'bg-slate-600',
              };
              return (
                <div key={status}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-300">{status}</span>
                    <span className="text-slate-500">{count}</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${barColor[status] ?? 'bg-slate-600'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-emerald-400" />
            Transaction Summary
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Total Transactions</span>
              <span className="text-slate-200 font-medium">{transactions.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Total Volume</span>
              <span className="text-slate-200 font-medium">{money(totalTxnAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Flagged Transactions</span>
              <span className="text-amber-300 font-medium">{flaggedTxns}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Active TOS Rules</span>
              <span className="text-slate-200 font-medium">{rules.filter((r) => r.active).length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">Customers Needing Review</h3>
            <a href={routeToHash({ name: 'queue' })} className="text-xs text-sky-400 hover:text-sky-300">View queue →</a>
          </div>
          <div className="space-y-2">
            {customers.filter((c) => c.human_review_status === 'Pending').slice(0, 6).map((c) => (
              <a
                key={c.id}
                href={routeToHash({ name: 'customer', id: c.id })}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 hover:bg-slate-800/70 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">{c.name}</p>
                  <p className="text-xs text-slate-500">#{c.customer_number} · {c.region || '—'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <AssessmentBadge status={c.ai_assessment_status} />
                </div>
              </a>
            ))}
            {customers.filter((c) => c.human_review_status === 'Pending').length === 0 && (
              <p className="text-sm text-slate-600 py-4 text-center">No customers pending review</p>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Recent Activity</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
            {audit.slice(0, 10).map((a) => (
              <div key={a.id} className="flex items-start gap-3 text-sm py-2 border-b border-slate-800/50 last:border-0">
                <div className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-2 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-slate-300 truncate">{a.action}</p>
                  <p className="text-xs text-slate-600">{a.actor} · {dateTimeStr(a.created_at)}</p>
                </div>
              </div>
            ))}
            {audit.length === 0 && <p className="text-sm text-slate-600 py-4 text-center">No activity recorded yet</p>}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Customers by Region</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Object.entries(byRegion).sort((a, b) => b[1] - a[1]).map(([region, count]) => (
            <div key={region} className="text-center p-3 rounded-lg bg-slate-800/40">
              <p className="text-lg font-semibold text-slate-200">{count}</p>
              <p className="text-xs text-slate-500 truncate">{region}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
