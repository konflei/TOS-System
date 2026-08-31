import { useEffect, useState, useMemo } from 'react';
import { ListChecks, AlertTriangle, Clock, ChevronRight } from 'lucide-react';
import { getCustomers } from '@/lib/db';
import type { Customer, AssessmentStatus } from '@/lib/types';
import { LoadingSpinner, EmptyState } from '@/components/ui/LoadingSpinner';
import { AssessmentBadge, HumanReviewBadge, Pill } from '@/components/ui/Badge';
import { dateStr } from '@/lib/format';
import { routeToHash } from '@/lib/router';

export function QueuePage() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filter, setFilter] = useState<'pending' | 'potential' | 'all'>('pending');

  useEffect(() => {
    (async () => {
      try {
        const data = await getCustomers();
        setCustomers(data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const queued = useMemo(() => {
    let list = customers;
    if (filter === 'pending') list = list.filter((c) => c.human_review_status === 'Pending');
    else if (filter === 'potential') list = list.filter((c) =>
      c.ai_assessment_status === 'Potential Violation' || c.ai_assessment_status === 'Confirmed Violation'
    );

    const severity: Record<AssessmentStatus, number> = {
      'Confirmed Violation': 4, 'Potential Violation': 3, 'Needs Review': 2, 'No Violation': 1, 'Not Assessed': 0,
    };
    return [...list].sort((a, b) => severity[b.ai_assessment_status] - severity[a.ai_assessment_status]);
  }, [customers, filter]);

  if (loading) return <LoadingSpinner label="Loading review queue…" />;

  const counts = {
    pending: customers.filter((c) => c.human_review_status === 'Pending').length,
    potential: customers.filter((c) => c.ai_assessment_status === 'Potential Violation' || c.ai_assessment_status === 'Confirmed Violation').length,
    all: customers.length,
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Review Queue</h2>
        <p className="text-sm text-slate-500 mt-1">Customers sorted by assessment severity, awaiting human review</p>
      </div>

      <div className="flex gap-2">
        {([
          ['pending', 'Pending Review', counts.pending],
          ['potential', 'Flagged', counts.potential],
          ['all', 'All Customers', counts.all],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${filter === key ? 'bg-sky-500/10 text-sky-400 font-medium' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
            onClick={() => setFilter(key)}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {queued.length === 0 ? (
        <div className="card"><EmptyState message="No customers in this queue" icon={ListChecks} /></div>
      ) : (
        <div className="space-y-2">
          {queued.map((c) => {
            const flags: string[] = [];
            if (c.vpn) flags.push('VPN');
            if (c.proxy) flags.push('Proxy');
            if (c.tor) flags.push('TOR');
            if (c.recent_abuse) flags.push('Abuse');
            if (c.notable_wallet_exposure) flags.push('Wallet Risk');
            return (
              <a
                key={c.id}
                href={routeToHash({ name: 'customer', id: c.id })}
                className="card card-hover p-4 flex items-center justify-between group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-slate-200">{c.name}</span>
                    <span className="text-xs text-slate-500">#{c.customer_number}</span>
                    {c.tos_review_priority === 'High' && <Pill color="red">High Priority</Pill>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{c.region || '—'}</span>
                    {flags.length > 0 && <span className="text-amber-400">{flags.join(' · ')}</span>}
                    <span>Last reviewed: {dateStr(c.last_reviewed_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <AssessmentBadge status={c.ai_assessment_status} />
                  <HumanReviewBadge status={c.human_review_status} />
                  <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
