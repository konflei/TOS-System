import type { AssessmentStatus, HumanReviewStatus, Confidence, EvidenceKind } from '@/lib/types';

export function money(n: number | null | undefined): string {
  const v = typeof n === 'number' ? n : 0;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function moneyExact(n: number | null | undefined): string {
  const v = typeof n === 'number' ? n : 0;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function dateStr(d: string | null | undefined): string {
  if (!d) return '—';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function dateTimeStr(d: string | null | undefined): string {
  if (!d) return '—';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export const assessmentColors: Record<AssessmentStatus, string> = {
  'Confirmed Violation': 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
  'Potential Violation': 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
  'Needs Review': 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  'No Violation': 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  'Not Assessed': 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/30',
};

export const humanReviewColors: Record<HumanReviewStatus, string> = {
  'Approved Violation': 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
  'Rejected': 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  'Needs More Evidence': 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
  'Pending': 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/30',
};

export const confidenceColors: Record<Confidence, string> = {
  High: 'bg-slate-200 text-slate-900',
  Moderate: 'bg-slate-400/30 text-slate-200',
  Low: 'bg-slate-600/40 text-slate-300',
};

export const evidenceKindColors: Record<EvidenceKind, string> = {
  FACT: 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30',
  INDICATOR: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
  INFERENCE: 'bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30',
  'MISSING EVIDENCE': 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/30',
};

export const riskColors: Record<string, string> = {
  Severe: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
  High: 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30',
  Medium: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
  Low: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  Unknown: 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/30',
};
