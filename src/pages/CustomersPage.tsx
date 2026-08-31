import { useEffect, useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, Users, Flag } from 'lucide-react';
import { getCustomers } from '@/lib/db';
import type { Customer, AssessmentStatus, HumanReviewStatus } from '@/lib/types';
import { LoadingSpinner, EmptyState } from '@/components/ui/LoadingSpinner';
import { AssessmentBadge, HumanReviewBadge, Pill } from '@/components/ui/Badge';
import { dateStr } from '@/lib/format';
import type { Route } from '@/lib/router';
import { routeToHash } from '@/lib/router';

type SortKey = 'customer_number' | 'name' | 'ai_assessment_status' | 'human_review_status' | 'last_reviewed_at';

const ASSESSMENT_FILTERS: (AssessmentStatus | 'All')[] = ['All', 'Potential Violation', 'Needs Review', 'No Violation', 'Confirmed Violation', 'Not Assessed'];
const REVIEW_FILTERS: (HumanReviewStatus | 'All')[] = ['All', 'Pending', 'Approved Violation', 'Rejected', 'Needs More Evidence'];

export function CustomersPage() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [assessFilter, setAssessFilter] = useState<AssessmentStatus | 'All'>('All');
  const [reviewFilter, setReviewFilter] = useState<HumanReviewStatus | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('customer_number');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  useEffect(() => {
    (async () => {
      try {
        const data = await getCustomers();
        setCustomers(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let result = customers;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        String(c.customer_number ?? '').includes(q) ||
        c.region.toLowerCase().includes(q)
      );
    }
    if (assessFilter !== 'All') result = result.filter((c) => c.ai_assessment_status === assessFilter);
    if (reviewFilter !== 'All') result = result.filter((c) => c.human_review_status === reviewFilter);

    result = [...result].sort((a, b) => {
      let av: string | number = a[sortKey] ?? '';
      let bv: string | number = b[sortKey] ?? '';
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return result;
  }, [customers, search, assessFilter, reviewFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  if (loading) return <LoadingSpinner label="Loading customers…" />;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Customer Reviews</h2>
          <p className="text-sm text-slate-500 mt-1">{filtered.length} customers · click any row to view full evidence and assessment</p>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input w-full pl-9"
              placeholder="Search by name, email, customer #, or region…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="input" value={assessFilter} onChange={(e) => { setAssessFilter(e.target.value as AssessmentStatus | 'All'); setPage(0); }}>
              {ASSESSMENT_FILTERS.map((f) => <option key={f} value={f}>{f === 'All' ? 'All Assessments' : f}</option>)}
            </select>
            <select className="input" value={reviewFilter} onChange={(e) => { setReviewFilter(e.target.value as HumanReviewStatus | 'All'); setPage(0); }}>
              {REVIEW_FILTERS.map((f) => <option key={f} value={f}>{f === 'All' ? 'All Review Status' : f}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 cursor-pointer hover:text-slate-300" onClick={() => toggleSort('customer_number')}>
                  Customer #
                </th>
                <th className="text-left px-4 py-3 cursor-pointer hover:text-slate-300" onClick={() => toggleSort('name')}>
                  Name
                </th>
                <th className="text-left px-4 py-3">Region</th>
                <th className="text-left px-4 py-3">IP Flags</th>
                <th className="text-left px-4 py-3 cursor-pointer hover:text-slate-300" onClick={() => toggleSort('ai_assessment_status')}>
                  AI Assessment
                </th>
                <th className="text-left px-4 py-3 cursor-pointer hover:text-slate-300" onClick={() => toggleSort('human_review_status')}>
                  Human Review
                </th>
                <th className="text-left px-4 py-3 cursor-pointer hover:text-slate-300" onClick={() => toggleSort('last_reviewed_at')}>
                  Last Reviewed
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => {
                const flags: string[] = [];
                if (c.vpn) flags.push('VPN');
                if (c.proxy) flags.push('Proxy');
                if (c.tor) flags.push('TOR');
                if (c.recent_abuse) flags.push('Abuse');
                if (c.geo_inconsistency) flags.push('Geo');
                return (
                  <tr
                    key={c.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer"
                    onClick={() => { window.location.hash = routeToHash({ name: 'customer', id: c.id }); }}
                  >
                    <td className="px-4 py-3 text-slate-500">#{c.customer_number ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-200 font-medium">{c.name}</div>
                      <div className="text-xs text-slate-500">{c.email || 'No email'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{c.region || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {flags.length === 0 ? <span className="text-slate-600 text-xs">—</span> :
                          flags.map((f) => <Pill key={f} color={f === 'Abuse' ? 'red' : 'amber'}>{f}</Pill>)
                        }
                      </div>
                    </td>
                    <td className="px-4 py-3"><AssessmentBadge status={c.ai_assessment_status} /></td>
                    <td className="px-4 py-3"><HumanReviewBadge status={c.human_review_status} /></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{dateStr(c.last_reviewed_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {paged.length === 0 && <EmptyState message="No customers match the current filters" icon={Users} />}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <span className="text-xs text-slate-500">
              Page {page + 1} of {totalPages} · {filtered.length} results
            </span>
            <div className="flex gap-1">
              <button className="btn-ghost px-2 py-1" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft size={16} />
              </button>
              <button className="btn-ghost px-2 py-1" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
