export type AssessmentStatus =
  | 'No Violation'
  | 'Potential Violation'
  | 'Needs Review'
  | 'Confirmed Violation'
  | 'Not Assessed';

export type HumanReviewStatus =
  | 'Pending'
  | 'Approved Violation'
  | 'Rejected'
  | 'Needs More Evidence';

export type Confidence = 'Low' | 'Moderate' | 'High';

export type EvidenceKind = 'FACT' | 'INDICATOR' | 'INFERENCE' | 'MISSING EVIDENCE';

export interface EvidenceItem {
  kind: EvidenceKind;
  text: string;
}

export interface ClauseRef {
  section: string;
  clause_name: string;
}

export const VIOLATION_TYPES = [
  'Underage use',
  'False or misleading information',
  'Identity / KYC mismatch',
  'KYC circumvention',
  'Multiple-account circumvention',
  'Fraudulent payment activity',
  'Fraudulent or abusive chargeback',
  'Unauthorized payment method',
  'Security-control circumvention',
  'Transaction-limit circumvention',
  'AML/compliance circumvention',
  'Material misrepresentation',
  'Other TOS violation',
] as const;

export interface Customer {
  id: string;
  customer_number: number | null;
  name: string;
  email: string;
  alt_emails: string[];
  region: string;
  age: number | null;
  compliance_status: string;
  vpn: boolean;
  proxy: boolean;
  tor: boolean;
  mobile_ip: boolean;
  recent_abuse: boolean;
  crawler: boolean;
  geo_inconsistency: boolean;
  device_inconsistency: boolean;
  ai_assessment_status: AssessmentStatus;
  human_review_status: HumanReviewStatus;
  is_demo: boolean;
  notes: string;
  last_reviewed_at: string | null;
  created_at: string;
  address?: string;
  review_flag?: string;
  ai_summary?: string;
  profile_link?: string;
  tos_review_priority?: string;
  wallets_listed?: number | null;
  wallets_screened?: number | null;
  max_wallet_risk_score?: number | null;
  wallets_scored_25?: number | null;
  notable_wallet_exposure?: boolean;
  notable_wallet_exposure_detail?: string;
  preliminary_tos_position?: string;
  tos_assessment_notes?: string;
  transactions_linked_to_evidence?: string;
  source_data?: Record<string, unknown>;
}

export interface Transaction {
  id: string;
  customer_id: string;
  order_id: string;
  txn_date: string | null;
  amount: number;
  currency: string;
  status: string;
  fulfilled: string;
  refund_status: string;
  chargeback_status: string;
  destination_wallet: string;
  txn_hash: string;
  tos_assessment_status: AssessmentStatus;
  created_at: string;
  order_link?: string;
  source_data?: Record<string, unknown>;
}

export interface CustomerEmail {
  id: string;
  customer_id: string;
  subject: string;
  from_email: string;
  order_refs: string;
  body_text: string;
  compliance_answers: string;
  refund_explanation: string;
  third_party_statement: string;
  wallet_ownership_statement: string;
  attachment_names: string[];
  received_at: string | null;
}

export interface IpDeviceEvent {
  id: string;
  customer_id: string;
  ip_address: string;
  vpn: boolean;
  proxy: boolean;
  tor: boolean;
  mobile_ip: boolean;
  recent_abuse: boolean;
  crawler: boolean;
  geo_note: string;
  device_note: string;
  raw_evidence: string;
}

export interface WalletScreening {
  id: string;
  wallet_id: string;
  risk_score: number | null;
  risk_level: string;
  sanctions: boolean;
  scam_fraud: boolean;
  mixer: boolean;
  darknet: boolean;
  stolen_funds: boolean;
  exposures: { category: string; exposure: string }[];
  raw_findings: string;
}

export interface Wallet {
  id: string;
  customer_id: string;
  address: string;
  network: string;
  currency: string;
  linked_transaction_id: string | null;
  link_confidence: string;
  screenings?: WalletScreening[];
}

export interface Refund {
  id: string;
  transaction_id: string | null;
  customer_id: string;
  status: string;
  amount: number;
  reason: string;
  requested_at: string | null;
}

export interface Chargeback {
  id: string;
  transaction_id: string | null;
  customer_id: string;
  status: string;
  legitimacy: string;
  bank_statement: string;
  authorized_claim: string;
  evidence: string;
}

export interface TosRule {
  id: string;
  section: string;
  clause_name: string;
  clause_text: string;
  internal_description: string;
  evidence_requirements: string;
  damages_may_apply: boolean;
  active: boolean;
  internal_notes: string;
  sort_order: number;
}

export interface Assessment {
  id: string;
  customer_id: string;
  transaction_id?: string | null;
  overall_assessment: AssessmentStatus;
  confidence: Confidence;
  executive_summary: string;
  applicable_clauses: ClauseRef[];
  supporting_evidence: EvidenceItem[];
  mitigating_evidence: EvidenceItem[];
  missing_evidence: EvidenceItem[];
  transaction_linkage?: string;
  suggested_violation_types: string[];
  generated_at: string;
}

export interface HumanReview {
  id: string;
  customer_id: string;
  transaction_id: string | null;
  decision: string;
  reviewer_name: string;
  notes: string;
  prior_ai_conclusion: string;
  created_at: string;
}

export interface DamageAssessment {
  id: string;
  customer_id: string;
  confirmed_violating_transactions: number;
  default_amount: number;
  suggested_damages: number;
  approved_damages: number;
  manual_adjustment: number;
  amount_recovered: number;
  remaining: number;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string | null;
  customer_id: string | null;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  created_at: string;
}
