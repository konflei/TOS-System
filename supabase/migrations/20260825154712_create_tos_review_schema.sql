/*
# ChicksX TOS Violation Review — Initial Schema

Creates the full relational data model for an internal compliance review system that
assesses whether customer activity and individual transactions potentially violated the
ChicksX Terms of Service. This is a review system, not an automatic enforcement engine.

## 1. New Tables
- `customers` — one row per customer. Holds identity, region, age, consolidated device/IP
  summary flags (VPN/Proxy/TOR/etc.), compliance status, AI assessment status, human review
  status, and last-reviewed timestamp.
- `transactions` — one row per order. Amount, currency, status, fulfillment, refund/chargeback
  status, destination wallet, transaction hash, and its independent TOS assessment status.
- `customer_emails` — raw customer-authored email evidence (subject, body, statements,
  attachment names). Preserved verbatim as evidence.
- `ip_device_events` — raw IP/device evidence rows (VPN/Proxy/TOR/Mobile IP/Recent Abuse/
  Crawler flags, geo/device inconsistencies, raw notes).
- `wallets` — wallet identity: address, network/currency, and whether it is confirmed as the
  source/destination of a specific transaction (linked_transaction_id) or merely associated
  with the customer.
- `wallet_screenings` — screening/risk findings for a wallet (risk score/level, sanctions,
  scam, mixer, darknet, stolen-funds exposures, raw findings).
- `refunds` — refund requests and status per transaction.
- `chargebacks` — chargeback / bank-dispute records with legitimacy classification and bank
  statements made by the customer.
- `tos_rules` — the governing Terms of Service converted into manageable rules.
- `customer_assessments` — automated customer-level assessment output.
- `transaction_assessments` — automated per-transaction assessment output (each transaction
  assessed independently).
- `human_reviews` — reviewer decisions with notes; doubles as review history.
- `damage_assessments` — configurable damages per customer (confirmed violating transactions,
  suggested, approved, manual adjustment, recovered, remaining).
- `audit_logs` — append-only audit trail (AI conclusion, human decision, notes, damage changes).
- `app_settings` — key/value application settings (default damage amount, current reviewer).
- `import_batches` — record of data-import runs.

## 2. Security
- RLS enabled on every table.
- This is an internal tool with no sign-in screen, so each table has 4 policies
  (select/insert/update/delete) scoped `TO anon, authenticated` with `USING (true)` /
  `WITH CHECK (true)`. The data is intentionally shared across all reviewers using the tool.

## 3. Notes
1. Assessment status values are constrained to: No Violation, Potential Violation, Needs Review,
   Confirmed Violation (plus Not Assessed for the unreviewed default).
2. Damages are never auto-applied — approved_damages is a manual field and remains editable.
3. Indicators (VPN, proxy, high wallet risk, refunds) are stored as raw data and never
   converted to confirmed violations by the schema.
*/

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_number integer UNIQUE,
  name text NOT NULL DEFAULT '',
  email text DEFAULT '',
  alt_emails text[] NOT NULL DEFAULT '{}',
  region text DEFAULT '',
  age integer,
  compliance_status text NOT NULL DEFAULT 'Unknown',
  vpn boolean NOT NULL DEFAULT false,
  proxy boolean NOT NULL DEFAULT false,
  tor boolean NOT NULL DEFAULT false,
  mobile_ip boolean NOT NULL DEFAULT false,
  recent_abuse boolean NOT NULL DEFAULT false,
  crawler boolean NOT NULL DEFAULT false,
  geo_inconsistency boolean NOT NULL DEFAULT false,
  device_inconsistency boolean NOT NULL DEFAULT false,
  ai_assessment_status text NOT NULL DEFAULT 'Not Assessed',
  human_review_status text NOT NULL DEFAULT 'Pending',
  is_demo boolean NOT NULL DEFAULT false,
  notes text DEFAULT '',
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id text NOT NULL DEFAULT '',
  txn_date date,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'Unknown',
  fulfilled text NOT NULL DEFAULT 'Unknown',
  refund_status text NOT NULL DEFAULT 'None',
  chargeback_status text NOT NULL DEFAULT 'None',
  destination_wallet text DEFAULT '',
  txn_hash text DEFAULT '',
  tos_assessment_status text NOT NULL DEFAULT 'Not Assessed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subject text DEFAULT '',
  from_email text DEFAULT '',
  order_refs text DEFAULT '',
  body_text text DEFAULT '',
  compliance_answers text DEFAULT '',
  refund_explanation text DEFAULT '',
  third_party_statement text DEFAULT '',
  wallet_ownership_statement text DEFAULT '',
  attachment_names text[] NOT NULL DEFAULT '{}',
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ip_device_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  ip_address text DEFAULT '',
  vpn boolean NOT NULL DEFAULT false,
  proxy boolean NOT NULL DEFAULT false,
  tor boolean NOT NULL DEFAULT false,
  mobile_ip boolean NOT NULL DEFAULT false,
  recent_abuse boolean NOT NULL DEFAULT false,
  crawler boolean NOT NULL DEFAULT false,
  geo_note text DEFAULT '',
  device_note text DEFAULT '',
  raw_evidence text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address text NOT NULL DEFAULT '',
  network text DEFAULT '',
  currency text DEFAULT '',
  linked_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  link_confidence text NOT NULL DEFAULT 'Associated with customer',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  risk_score integer,
  risk_level text NOT NULL DEFAULT 'Unknown',
  sanctions boolean NOT NULL DEFAULT false,
  scam_fraud boolean NOT NULL DEFAULT false,
  mixer boolean NOT NULL DEFAULT false,
  darknet boolean NOT NULL DEFAULT false,
  stolen_funds boolean NOT NULL DEFAULT false,
  exposures jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_findings text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Requested',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  reason text DEFAULT '',
  requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chargebacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Unresolved',
  legitimacy text NOT NULL DEFAULT 'Undetermined',
  bank_statement text DEFAULT '',
  authorized_claim text DEFAULT '',
  evidence text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tos_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL DEFAULT '',
  clause_name text NOT NULL DEFAULT '',
  clause_text text NOT NULL DEFAULT '',
  internal_description text DEFAULT '',
  evidence_requirements text DEFAULT '',
  damages_may_apply boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  internal_notes text DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  overall_assessment text NOT NULL DEFAULT 'Needs Review',
  confidence text NOT NULL DEFAULT 'Low',
  executive_summary text DEFAULT '',
  applicable_clauses jsonb NOT NULL DEFAULT '[]'::jsonb,
  supporting_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  mitigating_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_violation_types text[] NOT NULL DEFAULT '{}',
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transaction_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  overall_assessment text NOT NULL DEFAULT 'Needs Review',
  confidence text NOT NULL DEFAULT 'Low',
  executive_summary text DEFAULT '',
  applicable_clauses jsonb NOT NULL DEFAULT '[]'::jsonb,
  supporting_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  mitigating_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  transaction_linkage text DEFAULT '',
  suggested_violation_types text[] NOT NULL DEFAULT '{}',
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS human_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
  decision text NOT NULL DEFAULT 'Needs More Evidence',
  reviewer_name text NOT NULL DEFAULT 'Reviewer',
  notes text DEFAULT '',
  prior_ai_conclusion text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS damage_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  confirmed_violating_transactions integer NOT NULL DEFAULT 0,
  default_amount numeric(14,2) NOT NULL DEFAULT 2500,
  suggested_damages numeric(14,2) NOT NULL DEFAULT 0,
  approved_damages numeric(14,2) NOT NULL DEFAULT 0,
  manual_adjustment numeric(14,2) NOT NULL DEFAULT 0,
  amount_recovered numeric(14,2) NOT NULL DEFAULT 0,
  remaining numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL DEFAULT '',
  entity_id uuid,
  customer_id uuid,
  action text NOT NULL DEFAULT '',
  actor text NOT NULL DEFAULT 'Reviewer',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'csv',
  target_entity text NOT NULL DEFAULT '',
  row_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_emails_customer ON customer_emails(customer_id);
CREATE INDEX IF NOT EXISTS idx_ipdevice_customer ON ip_device_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_wallets_customer ON wallets(customer_id);
CREATE INDEX IF NOT EXISTS idx_screenings_wallet ON wallet_screenings(wallet_id);
CREATE INDEX IF NOT EXISTS idx_refunds_customer ON refunds(customer_id);
CREATE INDEX IF NOT EXISTS idx_chargebacks_customer ON chargebacks(customer_id);
CREATE INDEX IF NOT EXISTS idx_txn_assess_txn ON transaction_assessments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_cust_assess_customer ON customer_assessments(customer_id);
CREATE INDEX IF NOT EXISTS idx_human_reviews_customer ON human_reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_audit_customer ON audit_logs(customer_id);

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'customers','transactions','customer_emails','ip_device_events','wallets',
    'wallet_screenings','refunds','chargebacks','tos_rules','customer_assessments',
    'transaction_assessments','human_reviews','damage_assessments','audit_logs',
    'app_settings','import_batches'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_select_%1$s" ON %1$I;', t);
    EXECUTE format('CREATE POLICY "anon_select_%1$s" ON %1$I FOR SELECT TO anon, authenticated USING (true);', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%1$s" ON %1$I;', t);
    EXECUTE format('CREATE POLICY "anon_insert_%1$s" ON %1$I FOR INSERT TO anon, authenticated WITH CHECK (true);', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_%1$s" ON %1$I;', t);
    EXECUTE format('CREATE POLICY "anon_update_%1$s" ON %1$I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_delete_%1$s" ON %1$I;', t);
    EXECUTE format('CREATE POLICY "anon_delete_%1$s" ON %1$I FOR DELETE TO anon, authenticated USING (true);', t);
  END LOOP;
END $$;
