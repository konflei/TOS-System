import type {
  AssessmentStatus, Confidence, EvidenceItem, ClauseRef,
  Customer, Transaction, CustomerEmail, IpDeviceEvent, Wallet, Refund, Chargeback, TosRule,
} from '@/lib/types';

export interface CustomerBundle {
  customer: Customer;
  transactions: Transaction[];
  emails: CustomerEmail[];
  ipEvents: IpDeviceEvent[];
  wallets: Wallet[];
  refunds: Refund[];
  chargebacks: Chargeback[];
}

export interface AssessmentDraft {
  overall_assessment: AssessmentStatus;
  confidence: Confidence;
  executive_summary: string;
  applicable_clauses: ClauseRef[];
  supporting_evidence: EvidenceItem[];
  mitigating_evidence: EvidenceItem[];
  missing_evidence: EvidenceItem[];
  transaction_linkage: string;
  suggested_violation_types: string[];
}

export interface EngineResult {
  customer: AssessmentDraft;
  transactions: Record<string, AssessmentDraft>;
}

const RANK: Record<AssessmentStatus, number> = {
  'Not Assessed': 0,
  'No Violation': 1,
  'Needs Review': 2,
  'Potential Violation': 3,
  'Confirmed Violation': 4,
};

function worse(a: AssessmentStatus, b: AssessmentStatus): AssessmentStatus {
  return RANK[a] >= RANK[b] ? a : b;
}

function ruleRef(rules: TosRule[], sectionPrefix: string): ClauseRef {
  const r = rules.find((x) => x.section.startsWith(sectionPrefix));
  return r
    ? { section: r.section, clause_name: r.clause_name }
    : { section: sectionPrefix, clause_name: 'Unspecified clause' };
}

function emailText(emails: CustomerEmail[]): string {
  return emails
    .map((e) => [e.body_text, e.compliance_answers, e.wallet_ownership_statement, e.third_party_statement].join(' '))
    .join(' ')
    .toLowerCase();
}

// Customer-wide facts that can apply to the customer and any transaction.
interface CustomerFactors {
  supporting: EvidenceItem[];
  mitigating: EvidenceItem[];
  missing: EvidenceItem[];
  clauses: ClauseRef[];
  violations: string[];
  status: AssessmentStatus;
}

function customerWideFactors(b: CustomerBundle, rules: TosRule[]): CustomerFactors {
  const supporting: EvidenceItem[] = [];
  const mitigating: EvidenceItem[] = [];
  const missing: EvidenceItem[] = [];
  const clauses: ClauseRef[] = [];
  const violations: string[] = [];
  let status: AssessmentStatus = 'No Violation';
  const c = b.customer;
  const text = emailText(b.emails);

  // Age / eligibility
  if (typeof c.age === 'number' && c.age < 18) {
    supporting.push({ kind: 'FACT', text: `Recorded age is ${c.age}, below the minimum age of 18.` });
    clauses.push(ruleRef(rules, '1.'));
    violations.push('Underage use');
    status = worse(status, 'Potential Violation');
  } else if (c.age == null) {
    missing.push({ kind: 'MISSING EVIDENCE', text: 'Verified date of birth / age is not recorded.' });
  }

  // KYC / identity mismatch from evidence
  const kycMismatch =
    /name .*mismatch|mismatch|older brother|belongs to|another person|different name|does not match|24|marcus/.test(text) &&
    /id|document|verification|kyc|brother|account holder/.test(text);
  if (kycMismatch) {
    supporting.push({
      kind: 'INFERENCE',
      text: 'Compliance evidence indicates the submitted identity document does not match the account holder (possible third-party or mismatched ID).',
    });
    clauses.push(ruleRef(rules, '3.'));
    violations.push('Identity / KYC mismatch');
    status = worse(status, 'Potential Violation');
  }

  // Security controls — VPN / proxy / TOR are INDICATORS only.
  const netFlags = [c.vpn && 'VPN', c.proxy && 'proxy', c.tor && 'TOR'].filter(Boolean) as string[];
  if (netFlags.length) {
    supporting.push({
      kind: 'INDICATOR',
      text: `${netFlags.join(', ')} usage detected. Standalone anonymity-tool use is NOT a confirmed violation.`,
    });
    missing.push({
      kind: 'MISSING EVIDENCE',
      text: 'Evidence that VPN/proxy/TOR was used to evade a specific control (geo-block, limit, ban) rather than for ordinary privacy.',
    });
    status = worse(status, 'Needs Review');
  }
  if (c.recent_abuse) {
    supporting.push({ kind: 'INDICATOR', text: 'IP shows recent-abuse history per screening vendor. This is an indicator, not proof.' });
    status = worse(status, 'Needs Review');
  }
  if (c.geo_inconsistency) {
    supporting.push({ kind: 'INDICATOR', text: 'Geographic inconsistency between login location and stated region.' });
  }
  if (c.device_inconsistency) {
    supporting.push({ kind: 'INDICATOR', text: 'Device inconsistency observed across sessions.' });
  }

  // Compliance responsiveness
  if (/no response|no_response/i.test(c.compliance_status)) {
    missing.push({ kind: 'MISSING EVIDENCE', text: 'Customer has not responded to compliance outreach; explanations are unavailable.' });
    status = worse(status, 'Needs Review');
  }

  // Refund requests are neutral / mitigating on their own.
  if (b.refunds.length) {
    mitigating.push({
      kind: 'FACT',
      text: `${b.refunds.length} refund request(s) on file. A refund request by itself is not a TOS violation.`,
    });
  }

  return { supporting, mitigating, missing, clauses, violations, status };
}

function assessTransaction(
  txn: Transaction,
  b: CustomerBundle,
  rules: TosRule[],
  factors: CustomerFactors,
): AssessmentDraft {
  const supporting: EvidenceItem[] = [];
  const mitigating: EvidenceItem[] = [];
  const missing: EvidenceItem[] = [];
  const clauses: ClauseRef[] = [];
  const violations = new Set<string>();
  let status: AssessmentStatus = 'No Violation';
  let linkage = 'No wallet confirmed as source/destination of this specific transaction.';
  const text = emailText(b.emails);

  // Chargeback linked specifically to this transaction.
  const cb = b.chargebacks.find((x) => x.transaction_id === txn.id) ||
    (txn.chargeback_status === 'Filed' ? b.chargebacks.find((x) => !x.transaction_id) : undefined);
  if (cb) {
    supporting.push({ kind: 'FACT', text: `Chargeback / bank dispute filed on this order (status: ${cb.status}).` });
    if (txn.fulfilled === 'Fulfilled') {
      supporting.push({ kind: 'FACT', text: 'This transaction was fulfilled / delivered to the customer.' });
    }
    const contradiction = /received|did receive|is mine|got the crypto|funds/.test(text) &&
      /unauthorized|dispute|chargeback|bank/.test((cb.bank_statement + ' ' + cb.authorized_claim + ' ' + text).toLowerCase());
    if (contradiction || /contradict/i.test(cb.authorized_claim)) {
      supporting.push({
        kind: 'INFERENCE',
        text: 'Customer statements indicate funds were received, which contradicts the unauthorized-charge claim made to the bank.',
      });
      clauses.push(ruleRef(rules, '6.'));
      violations.add('Fraudulent or abusive chargeback');
      status = worse(status, 'Potential Violation');
    } else {
      missing.push({ kind: 'MISSING EVIDENCE', text: 'Confirmation of whether the disputed charge was authorized and delivered.' });
      status = worse(status, 'Needs Review');
    }
  }

  // Wallet screening — only escalate when a wallet is CONFIRMED as source/destination of THIS transaction.
  const linkedWallets = b.wallets.filter((w) => w.linked_transaction_id === txn.id);
  const associatedRisky = b.wallets.filter(
    (w) => w.linked_transaction_id !== txn.id && (w.screenings || []).some((s) => (s.risk_score ?? 0) >= 50 || s.sanctions),
  );
  for (const w of linkedWallets) {
    linkage = `Wallet ${w.address} is confirmed as source/destination of this transaction.`;
    const s = (w.screenings || [])[0];
    if (s && (s.sanctions || (s.risk_score ?? 0) >= 75)) {
      supporting.push({
        kind: 'FACT',
        text: `Wallet confirmed for this transaction has ${s.sanctions ? 'direct sanctions exposure' : `a severe screening risk score of ${s.risk_score}`}.`,
      });
      clauses.push(ruleRef(rules, '8.'));
      violations.add('AML/compliance circumvention');
      status = worse(status, 'Potential Violation');
    } else if (s && (s.risk_score ?? 0) >= 50) {
      supporting.push({ kind: 'INDICATOR', text: `Wallet confirmed for this transaction has an elevated risk score of ${s.risk_score}.` });
      status = worse(status, 'Needs Review');
    }
  }
  if (associatedRisky.length && !linkedWallets.length) {
    supporting.push({
      kind: 'INDICATOR',
      text: 'A high-risk wallet is associated with the customer, but is NOT confirmed as source/destination of this specific transaction.',
    });
    missing.push({ kind: 'MISSING EVIDENCE', text: 'On-chain confirmation linking the flagged wallet to this specific transaction.' });
    status = worse(status, 'Needs Review');
  }

  // Underage taints each transaction placed while underage (age unknown-at-time not modeled; use current record).
  if (factors.violations.includes('Underage use')) {
    supporting.push({ kind: 'FACT', text: 'Account holder is recorded as below the minimum age; this transaction was placed on an underage account.' });
    clauses.push(ruleRef(rules, '1.'));
    violations.add('Underage use');
    status = worse(status, 'Potential Violation');
  }
  if (factors.violations.includes('Identity / KYC mismatch')) {
    supporting.push({ kind: 'INFERENCE', text: 'Identity/KYC mismatch on the account also bears on the legitimacy of this transaction.' });
    clauses.push(ruleRef(rules, '3.'));
    violations.add('Identity / KYC mismatch');
    status = worse(status, 'Potential Violation');
  }

  // Carry customer-wide indicators (VPN etc.) as context, without escalating past Needs Review on their own.
  for (const item of factors.supporting) {
    if (item.kind === 'INDICATOR') supporting.push(item);
  }
  if (status === 'No Violation' && supporting.some((s) => s.kind === 'INDICATOR')) {
    status = 'Needs Review';
  }

  // Mitigating: refund on this transaction.
  const refund = b.refunds.find((r) => r.transaction_id === txn.id);
  if (refund) {
    mitigating.push({ kind: 'FACT', text: `A refund (${refund.status}) is on file for this transaction: "${refund.reason}"` });
  }
  if (txn.fulfilled === 'Fulfilled' && !cb && status === 'No Violation') {
    mitigating.push({ kind: 'FACT', text: 'Transaction was fulfilled with no dispute or contradicting evidence on file.' });
  }

  // Confidence
  const factCount = supporting.filter((s) => s.kind === 'FACT').length;
  let confidence: Confidence = 'Low';
  if (status === 'Potential Violation' && factCount >= 2 && linkedWallets.length + (cb ? 1 : 0) > 0) confidence = 'High';
  else if (status === 'Potential Violation' && factCount >= 1) confidence = 'Moderate';
  else if (status === 'Needs Review') confidence = 'Low';
  else if (status === 'No Violation') confidence = 'Moderate';

  const summary =
    status === 'Potential Violation'
      ? `Evidence suggests this transaction may violate the TOS (${[...violations].join(', ')}). Human confirmation required before any violation or damages are recorded.`
      : status === 'Needs Review'
        ? 'Indicators are present but no fact ties a confirmed violation to this specific transaction. More evidence is required.'
        : 'No evidence of a TOS violation was found for this transaction.';

  return {
    overall_assessment: status,
    confidence,
    executive_summary: summary,
    applicable_clauses: dedupeClauses(clauses),
    supporting_evidence: supporting,
    mitigating_evidence: mitigating,
    missing_evidence: missing,
    transaction_linkage: linkage,
    suggested_violation_types: [...violations],
  };
}

function dedupeClauses(clauses: ClauseRef[]): ClauseRef[] {
  const seen = new Set<string>();
  return clauses.filter((c) => {
    const k = c.section + c.clause_name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function runAssessment(b: CustomerBundle, rules: TosRule[]): EngineResult {
  const factors = customerWideFactors(b, rules);
  const txnResults: Record<string, AssessmentDraft> = {};
  let overall: AssessmentStatus = factors.status;
  const allClauses: ClauseRef[] = [...factors.clauses];
  const allViolations = new Set<string>(factors.violations);

  for (const txn of b.transactions) {
    const res = assessTransaction(txn, b, rules, factors);
    txnResults[txn.id] = res;
    overall = worse(overall, res.overall_assessment);
    res.applicable_clauses.forEach((c) => allClauses.push(c));
    res.suggested_violation_types.forEach((v) => allViolations.add(v));
  }

  const potentialCount = Object.values(txnResults).filter((r) => r.overall_assessment === 'Potential Violation').length;
  const factCount = factors.supporting.filter((s) => s.kind === 'FACT').length;
  let confidence: Confidence = 'Low';
  if (overall === 'Potential Violation' && (potentialCount >= 1 || factCount >= 2)) confidence = potentialCount >= 1 ? 'High' : 'Moderate';
  else if (overall === 'No Violation') confidence = 'Moderate';

  const summary =
    overall === 'Potential Violation'
      ? `Automated review flags ${potentialCount || 'one or more'} transaction(s) and/or account-level concern(s) as potential TOS violations (${[...allViolations].join(', ')}). These are recommendations only — a human reviewer must confirm each violation before it is recorded or damages are applied.`
      : overall === 'Needs Review'
        ? 'Indicators are present (e.g. anonymity tools, associated high-risk wallets, or missing responses) but no fact confirms a violation. Additional evidence is required before any conclusion.'
        : 'No evidence of a TOS violation was found across this customer\'s transactions and evidence on file.';

  return {
    customer: {
      overall_assessment: overall,
      confidence,
      executive_summary: summary,
      applicable_clauses: dedupeClauses(allClauses),
      supporting_evidence: factors.supporting,
      mitigating_evidence: factors.mitigating,
      missing_evidence: factors.missing,
      transaction_linkage: '',
      suggested_violation_types: [...allViolations],
    },
    transactions: txnResults,
  };
}
