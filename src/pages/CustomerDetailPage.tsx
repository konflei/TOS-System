import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Mail, Globe, Smartphone, Wallet, Scale, FileText, DollarSign,
  CheckCircle, XCircle, AlertCircle, Sparkles, Clock, Shield, MapPin, User,
} from 'lucide-react';
import {
  getCustomerBundle, getTosRules, getCustomerAssessment, getHumanReviews,
  getDamage, saveAssessments, submitHumanReview, upsertDamage, logAudit,
} from '@/lib/db';
import { runAssessment } from '@/lib/assessment';
import type {
  CustomerBundle, TosRule, Assessment, HumanReview, DamageAssessment,
  AssessmentStatus, HumanReviewStatus, EvidenceItem, ClauseRef,
} from '@/lib/types';
import { LoadingSpinner, ErrorState } from '@/components/ui/LoadingSpinner';
import { AssessmentBadge, HumanReviewBadge, ConfidenceBadge, EvidenceKindBadge, Pill } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { money, moneyExact, dateStr, dateTimeStr } from '@/lib/format';
import type { Route } from '@/lib/router';
import { routeToHash } from '@/lib/router';

type Tab = 'overview' | 'transactions' | 'emails' | 'ip' | 'wallets' | 'assessment' | 'damages' | 'audit';

export function CustomerDetailPage({ id, navigate }: { id: string; navigate: (r: Route) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bundle, setBundle] = useState<CustomerBundle | null>(null);
  const [rules, setRules] = useState<TosRule[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [reviews, setReviews] = useState<HumanReview[]>([]);
  const [damage, setDamage] = useState<DamageAssessment | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [reviewModal, setReviewModal] = useState(false);
  const [assessing, setAssessing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [b, r, a, rev, d] = await Promise.all([
        getCustomerBundle(id), getTosRules(), getCustomerAssessment(id),
        getHumanReviews(id), getDamage(id),
      ]);
      if (!b) { setError('Customer not found'); return; }
      setBundle(b); setRules(r); setAssessment(a); setReviews(rev); setDamage(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const runAIAssessment = async () => {
    if (!bundle) return;
    setAssessing(true);
    try {
      const result = runAssessment(bundle, rules);
      await saveAssessments(id, result.customer, result.transactions);
      const updated = await getCustomerAssessment(id);
      setAssessment(updated);
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setAssessing(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading customer data…" />;
  if (error) return <ErrorState message={error} />;
  if (!bundle) return <ErrorState message="Customer not found" />;

  const { customer: c, transactions, emails, ipEvents, wallets, refunds, chargebacks } = bundle;

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: User },
    { key: 'transactions', label: 'Transactions', icon: FileText, count: transactions.length },
    { key: 'emails', label: 'Emails & Compliance', icon: Mail, count: emails.length },
    { key: 'ip', label: 'IP / Device', icon: Globe, count: ipEvents.length },
    { key: 'wallets', label: 'Wallets', icon: Wallet, count: wallets.length },
    { key: 'assessment', label: 'TOS Assessment', icon: Scale },
    { key: 'damages', label: 'Damages', icon: DollarSign },
    { key: 'audit', label: 'Audit Trail', icon: Clock },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <a href={routeToHash({ name: 'customers' })} className="btn-ghost px-2 py-1">
          <ArrowLeft size={18} />
        </a>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-100 truncate">{c.name}</h2>
            <span className="text-sm text-slate-500">#{c.customer_number}</span>
          </div>
          <p className="text-sm text-slate-500">{c.email || 'No primary email'} · {c.region || 'Unknown region'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AssessmentBadge status={c.ai_assessment_status} />
          <HumanReviewBadge status={c.human_review_status} />
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={runAIAssessment} disabled={assessing}>
            <Sparkles size={16} />
            {assessing ? 'Assessing…' : 'Run AI Assessment'}
          </button>
          <button className="btn-danger" onClick={() => setReviewModal(true)}>
            <CheckCircle size={16} />
            Submit Human Review
          </button>
          {c.is_demo && <Pill color="slate">Demo</Pill>}
          {c.review_flag && <Pill color="amber">{c.review_flag}</Pill>}
          {c.tos_review_priority && <Pill color={c.tos_review_priority === 'High' ? 'red' : c.tos_review_priority === 'Medium' ? 'amber' : 'slate'}>
            Priority: {c.tos_review_priority}
          </Pill>}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex overflow-x-auto scrollbar-thin border-b border-slate-800">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap transition-colors ${active ? 'tab-active' : 'tab-inactive'}`}
                onClick={() => setTab(t.key)}
              >
                <Icon size={15} />
                {t.label}
                {t.count != null && t.count > 0 && <span className="text-xs text-slate-600">{t.count}</span>}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {tab === 'overview' && <OverviewTab bundle={bundle} />}
          {tab === 'transactions' && <TransactionsTab transactions={transactions} />}
          {tab === 'emails' && <EmailsTab emails={emails} />}
          {tab === 'ip' && <IpTab ipEvents={ipEvents} customer={c} />}
          {tab === 'wallets' && <WalletsTab wallets={wallets} />}
          {tab === 'assessment' && <AssessmentTab assessment={assessment} rules={rules} customerId={id} onRerun={runAIAssessment} assessing={assessing} />}
          {tab === 'damages' && <DamagesTab customerId={id} damage={damage} transactions={transactions} onUpdate={setDamage} />}
          {tab === 'audit' && <AuditTab reviews={reviews} customerId={id} />}
        </div>
      </div>

      <ReviewModal
        open={reviewModal}
        onClose={() => setReviewModal(false)}
        customerId={id}
        priorAI={c.ai_assessment_status}
        onSubmitted={async () => { setReviewModal(false); await loadData(); }}
      />
    </div>
  );
}

function OverviewTab({ bundle }: { bundle: CustomerBundle }) {
  const { customer: c, transactions, emails, ipEvents, wallets, refunds, chargebacks } = bundle;
  const totalAmount = transactions.reduce((s, t) => s + Number(t.amount), 0);
  const netFlags: string[] = [];
  if (c.vpn) netFlags.push('VPN');
  if (c.proxy) netFlags.push('Proxy');
  if (c.tor) netFlags.push('TOR');
  if (c.mobile_ip) netFlags.push('Mobile IP');
  if (c.recent_abuse) netFlags.push('Recent Abuse');
  if (c.crawler) netFlags.push('Crawler');
  if (c.geo_inconsistency) netFlags.push('Geo Inconsistency');
  if (c.device_inconsistency) netFlags.push('Device Inconsistency');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Identity</h4>
          <div className="space-y-2">
            <Row label="Name" value={c.name} />
            <Row label="Customer #" value={String(c.customer_number ?? '—')} />
            <Row label="Email" value={c.email || '—'} />
            {c.alt_emails.length > 0 && <Row label="Alt Emails" value={c.alt_emails.join(', ')} />}
            <Row label="Age" value={c.age != null ? String(c.age) : '—'} />
            <Row label="Region" value={c.region || '—'} icon={MapPin} />
            <Row label="Address" value={c.address || '—'} />
            <Row label="Compliance" value={c.compliance_status} />
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">IP / Device Flags</h4>
          {netFlags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {netFlags.map((f) => <Pill key={f} color={f === 'Recent Abuse' ? 'red' : 'amber'}>{f}</Pill>)}
            </div>
          ) : <p className="text-sm text-slate-600">No IP/device flags detected</p>}
        </div>

        {c.ai_summary && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">AI Summary</h4>
            <p className="text-sm text-slate-400 leading-relaxed bg-slate-800/30 rounded-lg p-3">{c.ai_summary}</p>
          </div>
        )}

        {c.preliminary_tos_position && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Preliminary TOS Position</h4>
            <p className="text-sm text-slate-400 leading-relaxed bg-slate-800/30 rounded-lg p-3">{c.preliminary_tos_position}</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Summary</h4>
          <div className="grid grid-cols-2 gap-3">
            <SummaryBox label="Transactions" value={String(transactions.length)} />
            <SummaryBox label="Total Volume" value={money(totalAmount)} />
            <SummaryBox label="Emails" value={String(emails.length)} />
            <SummaryBox label="IP Events" value={String(ipEvents.length)} />
            <SummaryBox label="Wallets" value={String(wallets.length)} />
            <SummaryBox label="Refunds" value={String(refunds.length)} />
            <SummaryBox label="Chargebacks" value={String(chargebacks.length)} />
            <SummaryBox label="Wallets Listed" value={String(c.wallets_listed ?? '—')} />
          </div>
        </div>

        {c.wallets_screened != null && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Wallet Screening</h4>
            <div className="space-y-2">
              <Row label="Wallets Screened" value={String(c.wallets_screened)} />
              {c.max_wallet_risk_score != null && <Row label="Max Risk Score" value={`${c.max_wallet_risk_score}%`} />}
              {c.wallets_scored_25 != null && <Row label="Wallets ≥25% Risk" value={String(c.wallets_scored_25)} />}
              {c.notable_wallet_exposure && <Row label="Notable Exposure" value={c.notable_wallet_exposure_detail || 'Yes'} />}
            </div>
          </div>
        )}

        {c.tos_assessment_notes && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">TOS Assessment Notes</h4>
            <p className="text-sm text-slate-400 leading-relaxed bg-slate-800/30 rounded-lg p-3">{c.tos_assessment_notes}</p>
          </div>
        )}

        {c.transactions_linked_to_evidence && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Transactions Linked to Evidence</h4>
            <p className="text-sm text-slate-400 leading-relaxed bg-slate-800/30 rounded-lg p-3">{c.transactions_linked_to_evidence}</p>
          </div>
        )}

        {c.profile_link && (
          <a href={c.profile_link} target="_blank" rel="noopener noreferrer" className="text-sm text-sky-400 hover:text-sky-300 inline-flex items-center gap-1">
            <Shield size={14} /> View Customer Profile →
          </a>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="flex items-start justify-between text-sm gap-4">
      <span className="text-slate-500 shrink-0 flex items-center gap-1.5">
        {Icon && <Icon size={14} className="text-slate-600" />}
        {label}
      </span>
      <span className="text-slate-300 text-right break-words">{value}</span>
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/40 rounded-lg p-3 text-center">
      <p className="text-lg font-semibold text-slate-200">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function TransactionsTab({ transactions }: { transactions: CustomerBundle['transactions'] }) {
  if (transactions.length === 0) return <p className="text-sm text-slate-600 py-8 text-center">No transactions on file</p>;
  return (
    <div className="space-y-3">
      {transactions.map((t) => (
        <div key={t.id} className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200">Order {t.order_id}</span>
                <AssessmentBadge status={t.tos_assessment_status} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{dateStr(t.txn_date)} · {t.currency}</p>
            </div>
            <span className="text-lg font-semibold text-slate-200">{moneyExact(t.amount)}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
            <div><span className="text-slate-500">Status:</span> <span className="text-slate-300">{t.status}</span></div>
            <div><span className="text-slate-500">Fulfilled:</span> <span className="text-slate-300">{t.fulfilled}</span></div>
            <div><span className="text-slate-500">Refund:</span> <span className="text-slate-300">{t.refund_status}</span></div>
            <div><span className="text-slate-500">Chargeback:</span> <span className="text-slate-300">{t.chargeback_status}</span></div>
          </div>
          {t.destination_wallet && <p className="text-xs text-slate-500 mt-2">Wallet: {t.destination_wallet}</p>}
          {t.order_link && (
            <a href={t.order_link} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:text-sky-300 mt-2 inline-block">
              View Order →
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function EmailsTab({ emails }: { emails: CustomerBundle['emails'] }) {
  if (emails.length === 0) return <p className="text-sm text-slate-600 py-8 text-center">No email evidence on file</p>;
  return (
    <div className="space-y-3">
      {emails.map((e) => (
        <div key={e.id} className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
          <div className="flex items-center gap-2 mb-2">
            <Mail size={14} className="text-sky-400" />
            <span className="text-sm font-medium text-slate-200">{e.subject || '(No subject)'}</span>
            <span className="text-xs text-slate-500 ml-auto">{dateTimeStr(e.received_at)}</span>
          </div>
          <p className="text-xs text-slate-500 mb-2">From: {e.from_email || '—'}</p>
          {e.order_refs && <p className="text-xs text-slate-500 mb-2">Order refs: {e.order_refs}</p>}
          {e.body_text && (
            <div className="mt-2">
              <p className="text-xs text-slate-500 mb-1">Body:</p>
              <p className="text-sm text-slate-400 whitespace-pre-wrap bg-slate-900/50 rounded p-3 max-h-40 overflow-y-auto scrollbar-thin">{e.body_text}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            {e.compliance_answers && <EvidenceField label="Compliance Answers" text={e.compliance_answers} />}
            {e.refund_explanation && <EvidenceField label="Refund Explanation" text={e.refund_explanation} />}
            {e.third_party_statement && <EvidenceField label="Third-Party Statement" text={e.third_party_statement} />}
            {e.wallet_ownership_statement && <EvidenceField label="Wallet Ownership Statement" text={e.wallet_ownership_statement} />}
          </div>
          {e.attachment_names && e.attachment_names.length > 0 && (
            <p className="text-xs text-slate-500 mt-2">Attachments: {e.attachment_names.join(', ')}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function EvidenceField({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}:</p>
      <p className="text-sm text-slate-400 bg-slate-900/50 rounded p-2 max-h-32 overflow-y-auto scrollbar-thin">{text}</p>
    </div>
  );
}

function IpTab({ ipEvents, customer }: { ipEvents: CustomerBundle['ipEvents']; customer: CustomerBundle['customer'] }) {
  return (
    <div className="space-y-4">
      <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Consolidated IP / Device Summary</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['VPN', customer.vpn], ['Proxy', customer.proxy], ['TOR', customer.tor], ['Mobile IP', customer.mobile_ip],
            ['Recent Abuse', customer.recent_abuse], ['Crawler', customer.crawler],
            ['Geo Inconsistency', customer.geo_inconsistency], ['Device Inconsistency', customer.device_inconsistency],
          ].map(([label, val]) => (
            <div key={label as string} className={`flex items-center gap-2 text-sm ${val ? 'text-amber-300' : 'text-slate-600'}`}>
              {val ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
              {label}
            </div>
          ))}
        </div>
      </div>

      {ipEvents.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Raw IP / Device Events</h4>
          {ipEvents.map((ev) => (
            <div key={ev.id} className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
              <div className="flex items-center gap-2 mb-2">
                <Globe size={14} className="text-sky-400" />
                <span className="text-sm text-slate-200">{ev.ip_address || 'Unknown IP'}</span>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                {[['VPN', ev.vpn], ['Proxy', ev.proxy], ['TOR', ev.tor], ['Mobile', ev.mobile_ip], ['Abuse', ev.recent_abuse], ['Crawler', ev.crawler]].map(([l, v]) => (
                  <span key={l as string} className={v ? 'text-amber-300' : 'text-slate-600'}>{l}: {v ? 'Yes' : 'No'}</span>
                ))}
              </div>
              {ev.geo_note && <p className="text-sm text-slate-400 mt-2">Geo: {ev.geo_note}</p>}
              {ev.device_note && <p className="text-sm text-slate-400 mt-1">Device: {ev.device_note}</p>}
              {ev.raw_evidence && <p className="text-xs text-slate-500 mt-2 bg-slate-900/50 rounded p-2">{ev.raw_evidence}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-600">No raw IP/device event records — using consolidated customer summary.</p>
      )}
    </div>
  );
}

function WalletsTab({ wallets }: { wallets: CustomerBundle['wallets'] }) {
  if (wallets.length === 0) return <p className="text-sm text-slate-600 py-8 text-center">No wallets on file</p>;
  return (
    <div className="space-y-3">
      {wallets.map((w) => (
        <div key={w.id} className="bg-slate-800/30 rounded-lg p-4 border border-slate-800/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Wallet size={14} className="text-sky-400" />
              <span className="text-sm font-mono text-slate-200">{w.address}</span>
            </div>
            <Pill color={w.link_confidence === 'Confirmed source/destination' ? 'red' : 'slate'}>{w.link_confidence}</Pill>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mt-2">
            <div><span className="text-slate-500">Network:</span> <span className="text-slate-300">{w.network || '—'}</span></div>
            <div><span className="text-slate-500">Currency:</span> <span className="text-slate-300">{w.currency || '—'}</span></div>
          </div>
          {w.screenings && w.screenings.length > 0 && (
            <div className="mt-3 space-y-2">
              {w.screenings.map((s) => (
                <div key={s.id} className="bg-slate-900/50 rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-slate-300">Risk Score: {s.risk_score ?? '—'}</span>
                    <Pill color={s.risk_level === 'Severe' ? 'red' : s.risk_level === 'High' ? 'red' : s.risk_level === 'Medium' ? 'amber' : 'emerald'}>
                      {s.risk_level}
                    </Pill>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.sanctions && <Pill color="red">Sanctions</Pill>}
                    {s.scam_fraud && <Pill color="red">Scam/Fraud</Pill>}
                    {s.mixer && <Pill color="amber">Mixer</Pill>}
                    {s.darknet && <Pill color="red">Darknet</Pill>}
                    {s.stolen_funds && <Pill color="red">Stolen Funds</Pill>}
                  </div>
                  {s.raw_findings && <p className="text-xs text-slate-500 mt-2">{s.raw_findings}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AssessmentTab({
  assessment, rules, customerId, onRerun, assessing,
}: {
  assessment: Assessment | null;
  rules: TosRule[];
  customerId: string;
  onRerun: () => void;
  assessing: boolean;
}) {
  if (!assessment) {
    return (
      <div className="text-center py-12">
        <Scale size={32} className="mx-auto text-slate-700 mb-3" />
        <p className="text-sm text-slate-500 mb-4">No AI assessment has been generated yet.</p>
        <button className="btn-primary" onClick={onRerun} disabled={assessing}>
          <Sparkles size={16} />
          {assessing ? 'Assessing…' : 'Generate Assessment'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AssessmentBadge status={assessment.overall_assessment as AssessmentStatus} />
          <ConfidenceBadge level={assessment.confidence as any} />
        </div>
        <button className="btn-ghost" onClick={onRerun} disabled={assessing}>
          <Sparkles size={14} />
          {assessing ? 'Assessing…' : 'Regenerate'}
        </button>
      </div>

      {assessment.executive_summary && (
        <div className="bg-slate-800/30 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Executive Summary</h4>
          <p className="text-sm text-slate-300 leading-relaxed">{assessment.executive_summary}</p>
        </div>
      )}

      {assessment.suggested_violation_types && assessment.suggested_violation_types.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Suggested Violation Types</h4>
          <div className="flex flex-wrap gap-2">
            {assessment.suggested_violation_types.map((v) => <Pill key={v} color="red">{v}</Pill>)}
          </div>
        </div>
      )}

      {assessment.applicable_clauses && assessment.applicable_clauses.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Applicable TOS Clauses</h4>
          <div className="space-y-2">
            {(assessment.applicable_clauses as ClauseRef[]).map((cl, i) => {
              const rule = rules.find((r) => r.section === cl.section);
              return (
                <div key={i} className="bg-slate-800/30 rounded-lg p-3">
                  <p className="text-sm text-slate-200">{cl.section}: {cl.clause_name}</p>
                  {rule?.damages_may_apply && <Pill color="amber">Damages may apply</Pill>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EvidenceSection title="Supporting Evidence" items={assessment.supporting_evidence as EvidenceItem[]} />
      <EvidenceSection title="Mitigating Evidence" items={assessment.mitigating_evidence as EvidenceItem[]} />
      <EvidenceSection title="Missing Evidence" items={assessment.missing_evidence as EvidenceItem[]} />
    </div>
  );
}

function EvidenceSection({ title, items }: { title: string; items: EvidenceItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3 bg-slate-800/30 rounded-lg p-3">
            <EvidenceKindBadge kind={item.kind} />
            <p className="text-sm text-slate-300 leading-relaxed flex-1">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DamagesTab({
  customerId, damage, transactions, onUpdate,
}: {
  customerId: string;
  damage: DamageAssessment | null;
  transactions: CustomerBundle['transactions'];
  onUpdate: (d: DamageAssessment) => void;
}) {
  const [confirmed, setConfirmed] = useState(damage?.confirmed_violating_transactions ?? 0);
  const [defaultAmt, setDefaultAmt] = useState(damage?.default_amount ?? 2500);
  const [approved, setApproved] = useState(damage?.approved_damages ?? 0);
  const [manualAdj, setManualAdj] = useState(damage?.manual_adjustment ?? 0);
  const [recovered, setRecovered] = useState(damage?.amount_recovered ?? 0);
  const [saving, setSaving] = useState(false);

  const suggested = confirmed * Number(defaultAmt);
  const remaining = Number(approved) + Number(manualAdj) - Number(recovered);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await upsertDamage(customerId, {
        confirmed_violating_transactions: Number(confirmed),
        default_amount: Number(defaultAmt),
        suggested_damages: suggested,
        approved_damages: Number(approved),
        manual_adjustment: Number(manualAdj),
        amount_recovered: Number(recovered),
        remaining,
      });
      onUpdate(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-800/30 rounded-lg p-4">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Damages Calculation</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate-400 block mb-1">Confirmed Violating Transactions</label>
            <input type="number" className="input w-full" value={confirmed} onChange={(e) => setConfirmed(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Default Amount per Violation</label>
            <input type="number" className="input w-full" value={defaultAmt} onChange={(e) => setDefaultAmt(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Approved Damages</label>
            <input type="number" className="input w-full" value={approved} onChange={(e) => setApproved(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Manual Adjustment</label>
            <input type="number" className="input w-full" value={manualAdj} onChange={(e) => setManualAdj(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Amount Recovered</label>
            <input type="number" className="input w-full" value={recovered} onChange={(e) => setRecovered(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryBox label="Suggested Damages" value={money(suggested)} />
        <SummaryBox label="Approved + Adj." value={money(Number(approved) + Number(manualAdj))} />
        <SummaryBox label="Recovered" value={money(Number(recovered))} />
        <SummaryBox label="Remaining" value={money(remaining)} />
      </div>

      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Transactions ({transactions.length})</h4>
        <div className="space-y-2">
          {transactions.map((t) => (
            <div key={t.id} className="flex items-center justify-between bg-slate-800/30 rounded-lg p-3 text-sm">
              <span className="text-slate-300">Order {t.order_id}</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{moneyExact(t.amount)}</span>
                <AssessmentBadge status={t.tos_assessment_status} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <button className="btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save Damages'}
      </button>
    </div>
  );
}

function AuditTab({ reviews, customerId }: { reviews: HumanReview[]; customerId: string }) {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { getAudit } = await import('@/lib/db');
        const logs = await getAudit(customerId);
        setAuditLogs(logs);
      } catch (e) { console.error(e); }
      finally { setLoadingLogs(false); }
    })();
  }, [customerId]);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Human Review History</h4>
        {reviews.length > 0 ? (
          <div className="space-y-2">
            {reviews.map((r) => (
              <div key={r.id} className="bg-slate-800/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-200">{r.decision}</span>
                  <span className="text-xs text-slate-500">{dateTimeStr(r.created_at)}</span>
                </div>
                <p className="text-xs text-slate-500">By {r.reviewer_name} · Prior AI: {r.prior_ai_conclusion}</p>
                {r.notes && <p className="text-sm text-slate-400 mt-1">{r.notes}</p>}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-600">No human reviews yet</p>}
      </div>

      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Audit Log</h4>
        {loadingLogs ? <p className="text-sm text-slate-600">Loading…</p> :
          auditLogs.length > 0 ? (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 bg-slate-800/30 rounded-lg p-3 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-2 shrink-0" />
                  <div className="flex-1">
                    <p className="text-slate-300">{log.action}</p>
                    <p className="text-xs text-slate-600">{log.actor} · {dateTimeStr(log.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-600">No audit entries</p>
        }
      </div>
    </div>
  );
}

function ReviewModal({
  open, onClose, customerId, priorAI, onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  priorAI: string;
  onSubmitted: () => void;
}) {
  const [decision, setDecision] = useState('Needs More Evidence');
  const [reviewer, setReviewer] = useState('Reviewer');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const decisions = ['Approved Violation', 'Rejected', 'Needs More Evidence'];
  const statusMap: Record<string, HumanReviewStatus> = {
    'Approved Violation': 'Approved Violation',
    'Rejected': 'Rejected',
    'Needs More Evidence': 'Needs More Evidence',
  };

  const submit = async () => {
    setSaving(true);
    try {
      await submitHumanReview({
        customer_id: customerId,
        transaction_id: null,
        decision,
        reviewer_name: reviewer,
        notes,
        prior_ai_conclusion: priorAI,
        human_review_status: statusMap[decision],
      });
      await onSubmitted();
      setNotes('');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submit Human Review"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Submitting…' : 'Submit Review'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm text-slate-400 block mb-1">Decision</label>
          <select className="input w-full" value={decision} onChange={(e) => setDecision(e.target.value)}>
            {decisions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm text-slate-400 block mb-1">Reviewer Name</label>
          <input className="input w-full" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
        </div>
        <div>
          <label className="text-sm text-slate-400 block mb-1">Notes</label>
          <textarea className="input w-full min-h-[100px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Review notes, evidence references, reasoning…" />
        </div>
        <p className="text-xs text-slate-600">Prior AI conclusion: {priorAI}</p>
      </div>
    </Modal>
  );
}
