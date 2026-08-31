import type { AssessmentStatus, HumanReviewStatus, Confidence, EvidenceKind } from '@/lib/types';
import { assessmentColors, humanReviewColors, confidenceColors, evidenceKindColors, riskColors } from '@/lib/format';

export function AssessmentBadge({ status }: { status: AssessmentStatus }) {
  return <span className={`badge ${assessmentColors[status] ?? assessmentColors['Not Assessed']}`}>{status}</span>;
}

export function HumanReviewBadge({ status }: { status: HumanReviewStatus }) {
  return <span className={`badge ${humanReviewColors[status] ?? humanReviewColors['Pending']}`}>{status}</span>;
}

export function ConfidenceBadge({ level }: { level: Confidence }) {
  return <span className={`badge ${confidenceColors[level] ?? confidenceColors['Low']}`}>{level}</span>;
}

export function EvidenceKindBadge({ kind }: { kind: EvidenceKind }) {
  return <span className={`badge ${evidenceKindColors[kind] ?? evidenceKindColors['FACT']}`}>{kind}</span>;
}

export function RiskBadge({ level }: { level: string }) {
  return <span className={`badge ${riskColors[level] ?? riskColors['Unknown']}`}>{level}</span>;
}

export function Pill({ children, color = 'slate' }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    slate: 'bg-slate-700/40 text-slate-300',
    red: 'bg-red-500/15 text-red-300',
    amber: 'bg-amber-500/15 text-amber-300',
    emerald: 'bg-emerald-500/15 text-emerald-300',
    sky: 'bg-sky-500/15 text-sky-300',
    blue: 'bg-blue-500/15 text-blue-300',
  };
  return <span className={`badge ${colors[color] ?? colors.slate}`}>{children}</span>;
}
