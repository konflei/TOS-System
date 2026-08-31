/*
# Add real-data columns to customers and transactions

Adds columns needed to store the actual ChicksX customer dataset fields from the
production CSV, including address, wallet screening summary, review priority, AI summary,
preliminary TOS position, and a source_data JSONB column that preserves the full raw CSV row.

## 1. Modified Tables
- `customers` — added: address, review_flag, ai_summary, profile_link, tos_review_priority,
  wallets_listed, wallets_screened, max_wallet_risk_score, wallets_scored_25,
  notable_wallet_exposure, notable_wallet_exposure_detail, preliminary_tos_position,
  tos_assessment_notes, transactions_linked_to_evidence, source_data
- `transactions` — added: order_link, source_data

## 2. Security
- No RLS changes — existing anon,authenticated policies cover the new columns automatically.

## 3. Notes
- All new columns are nullable / have safe defaults so existing rows are unaffected.
- source_data stores the raw parsed CSV row as JSONB for auditability.
*/

ALTER TABLE customers ADD COLUMN IF NOT EXISTS address text DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS review_flag text DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ai_summary text DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile_link text DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tos_review_priority text DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallets_listed integer;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallets_screened integer;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS max_wallet_risk_score numeric(5,1);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallets_scored_25 integer;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notable_wallet_exposure boolean NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notable_wallet_exposure_detail text DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS preliminary_tos_position text DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tos_assessment_notes text DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS transactions_linked_to_evidence text DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS source_data jsonb DEFAULT '{}'::jsonb;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_link text DEFAULT '';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_data jsonb DEFAULT '{}'::jsonb;
