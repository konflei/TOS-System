import { supabase } from '@/lib/supabase';
import type {
  Customer, Transaction, CustomerEmail, IpDeviceEvent, Wallet, WalletScreening,
  Refund, Chargeback, TosRule, Assessment, HumanReview, DamageAssessment, AuditLog,
  AssessmentStatus, HumanReviewStatus,
} from '@/lib/types';
import type { CustomerBundle, AssessmentDraft } from '@/lib/assessment';

export async function getCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase.from('customers').select('*').order('customer_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Customer[];
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Customer) ?? null;
}

export async function getTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase.from('transactions').select('*').order('txn_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Transaction[];
}

export async function getCustomerBundle(customerId: string): Promise<CustomerBundle | null> {
  const customer = await getCustomer(customerId);
  if (!customer) return null;
  const [tx, emails, ip, wallets, refunds, chargebacks] = await Promise.all([
    supabase.from('transactions').select('*').eq('customer_id', customerId).order('txn_date', { ascending: true }),
    supabase.from('customer_emails').select('*').eq('customer_id', customerId).order('received_at', { ascending: true }),
    supabase.from('ip_device_events').select('*').eq('customer_id', customerId),
    supabase.from('wallets').select('*, wallet_screenings(*)').eq('customer_id', customerId),
    supabase.from('refunds').select('*').eq('customer_id', customerId),
    supabase.from('chargebacks').select('*').eq('customer_id', customerId),
  ]);
  for (const r of [tx, emails, ip, wallets, refunds, chargebacks]) {
    if (r.error) throw r.error;
  }
  const walletsMapped: Wallet[] = (wallets.data ?? []).map((w) => {
    const { wallet_screenings, ...rest } = w as Wallet & { wallet_screenings: WalletScreening[] };
    return { ...(rest as Wallet), screenings: (wallet_screenings ?? []) as WalletScreening[] };
  });
  return {
    customer,
    transactions: (tx.data ?? []) as Transaction[],
    emails: (emails.data ?? []) as CustomerEmail[],
    ipEvents: (ip.data ?? []) as IpDeviceEvent[],
    wallets: walletsMapped,
    refunds: (refunds.data ?? []) as Refund[],
    chargebacks: (chargebacks.data ?? []) as Chargeback[],
  };
}

export async function getTosRules(): Promise<TosRule[]> {
  const { data, error } = await supabase.from('tos_rules').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TosRule[];
}

export async function saveTosRule(rule: Partial<TosRule>): Promise<void> {
  if (rule.id) {
    const { error } = await supabase.from('tos_rules').update(rule).eq('id', rule.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('tos_rules').insert(rule);
    if (error) throw error;
  }
}

export async function getCustomerAssessment(customerId: string): Promise<Assessment | null> {
  const { data, error } = await supabase
    .from('customer_assessments').select('*').eq('customer_id', customerId)
    .order('generated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as Assessment) ?? null;
}

export async function getTransactionAssessments(customerId: string): Promise<Record<string, Assessment>> {
  const { data, error } = await supabase
    .from('transaction_assessments').select('*').eq('customer_id', customerId)
    .order('generated_at', { ascending: false });
  if (error) throw error;
  const map: Record<string, Assessment> = {};
  for (const a of (data ?? []) as Assessment[]) {
    if (a.transaction_id && !map[a.transaction_id]) map[a.transaction_id] = a;
  }
  return map;
}

export async function saveAssessments(
  customerId: string,
  customerDraft: AssessmentDraft,
  txnDrafts: Record<string, AssessmentDraft>,
): Promise<void> {
  const { error: e1 } = await supabase.from('customer_assessments').insert({
    customer_id: customerId,
    overall_assessment: customerDraft.overall_assessment,
    confidence: customerDraft.confidence,
    executive_summary: customerDraft.executive_summary,
    applicable_clauses: customerDraft.applicable_clauses,
    supporting_evidence: customerDraft.supporting_evidence,
    mitigating_evidence: customerDraft.mitigating_evidence,
    missing_evidence: customerDraft.missing_evidence,
    suggested_violation_types: customerDraft.suggested_violation_types,
  });
  if (e1) throw e1;

  const rows = Object.entries(txnDrafts).map(([txnId, d]) => ({
    transaction_id: txnId,
    customer_id: customerId,
    overall_assessment: d.overall_assessment,
    confidence: d.confidence,
    executive_summary: d.executive_summary,
    applicable_clauses: d.applicable_clauses,
    supporting_evidence: d.supporting_evidence,
    mitigating_evidence: d.mitigating_evidence,
    missing_evidence: d.missing_evidence,
    transaction_linkage: d.transaction_linkage,
    suggested_violation_types: d.suggested_violation_types,
  }));
  if (rows.length) {
    const { error: e2 } = await supabase.from('transaction_assessments').insert(rows);
    if (e2) throw e2;
  }

  await supabase.from('customers').update({ ai_assessment_status: customerDraft.overall_assessment }).eq('id', customerId);
  for (const [txnId, d] of Object.entries(txnDrafts)) {
    await supabase.from('transactions').update({ tos_assessment_status: d.overall_assessment }).eq('id', txnId);
  }
  await logAudit({
    entity_type: 'assessment', customer_id: customerId, action: 'AI assessment generated',
    details: { overall: customerDraft.overall_assessment, confidence: customerDraft.confidence },
  });
}

export async function getHumanReviews(customerId: string): Promise<HumanReview[]> {
  const { data, error } = await supabase
    .from('human_reviews').select('*').eq('customer_id', customerId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as HumanReview[];
}

export async function submitHumanReview(input: {
  customer_id: string;
  transaction_id: string | null;
  decision: string;
  reviewer_name: string;
  notes: string;
  prior_ai_conclusion: string;
  human_review_status?: HumanReviewStatus;
  transaction_status?: AssessmentStatus;
}): Promise<void> {
  const { error } = await supabase.from('human_reviews').insert({
    customer_id: input.customer_id,
    transaction_id: input.transaction_id,
    decision: input.decision,
    reviewer_name: input.reviewer_name,
    notes: input.notes,
    prior_ai_conclusion: input.prior_ai_conclusion,
  });
  if (error) throw error;

  if (input.transaction_id && input.transaction_status) {
    await supabase.from('transactions').update({ tos_assessment_status: input.transaction_status }).eq('id', input.transaction_id);
  }
  const custPatch: Record<string, unknown> = { last_reviewed_at: new Date().toISOString() };
  if (input.human_review_status) custPatch.human_review_status = input.human_review_status;
  await supabase.from('customers').update(custPatch).eq('id', input.customer_id);

  await logAudit({
    entity_type: input.transaction_id ? 'transaction' : 'customer',
    entity_id: input.transaction_id,
    customer_id: input.customer_id,
    action: `Human review: ${input.decision}`,
    actor: input.reviewer_name,
    details: { notes: input.notes, prior_ai_conclusion: input.prior_ai_conclusion },
  });
}

export async function getDamage(customerId: string): Promise<DamageAssessment | null> {
  const { data, error } = await supabase.from('damage_assessments').select('*').eq('customer_id', customerId).maybeSingle();
  if (error) throw error;
  return (data as DamageAssessment) ?? null;
}

export async function upsertDamage(customerId: string, patch: Partial<DamageAssessment>): Promise<DamageAssessment> {
  const existing = await getDamage(customerId);
  const merged = { ...(existing ?? {}), ...patch, customer_id: customerId, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('damage_assessments').upsert(merged, { onConflict: 'customer_id' }).select().maybeSingle();
  if (error) throw error;
  return data as DamageAssessment;
}

export async function getAllDamages(): Promise<DamageAssessment[]> {
  const { data, error } = await supabase.from('damage_assessments').select('*');
  if (error) throw error;
  return (data ?? []) as DamageAssessment[];
}

export async function getAudit(customerId?: string): Promise<AuditLog[]> {
  let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
  if (customerId) q = q.eq('customer_id', customerId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AuditLog[];
}

export async function logAudit(entry: {
  entity_type: string; entity_id?: string | null; customer_id?: string | null;
  action: string; actor?: string; details?: Record<string, unknown>;
}): Promise<void> {
  await supabase.from('audit_logs').insert({
    entity_type: entry.entity_type,
    entity_id: entry.entity_id ?? null,
    customer_id: entry.customer_id ?? null,
    action: entry.action,
    actor: entry.actor ?? 'Reviewer',
    details: entry.details ?? {},
  });
}

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return (data?.value as T) ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export async function recordImport(input: {
  filename: string; source_type: string; target_entity: string;
  row_count: number; imported_count: number; mapping: Record<string, string>;
}): Promise<void> {
  const { error } = await supabase.from('import_batches').insert({ ...input, status: 'completed' });
  if (error) throw error;
}

export async function getImports() {
  const { data, error } = await supabase.from('import_batches').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
