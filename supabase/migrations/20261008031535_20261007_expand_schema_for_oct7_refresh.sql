/*
# Oct. 7 Refresh: Expand ip_device_events, wallet_screenings, wallets

## Purpose
Add new metadata columns to support the Oct. 7 data refresh without recreating
any tables. Add integer surrogate key columns (event_id, wallet_screening_id,
wallet_id) that allow UPSERT by stable source ID rather than by UUID or row
position. Existing columns, primary keys, foreign keys, RLS policies, and all
unrelated workflow data remain unchanged.

## 1. ip_device_events — new nullable columns
- event_id (integer, nullable, UNIQUE) — stable source identifier for UPSERT
- ip_score (numeric, nullable) — IP fraud risk score
- ip_address (text, nullable) — already exists as text with default '';
  ALTER to nullable and drop default so blank imports stay NULL, not ''
  (we keep the column; we only relax NOT NULL + remove default)
  NOTE: ip_address already exists — we add a separate nullable column is NOT needed.
  We only relax it.
- modified_date_raw (text, nullable) — raw modified date string from source
- city_region_zip (text, nullable) — location transcription
- hits (integer, nullable) — hit count from source
- latitude (numeric, nullable) — latitude from source
- longitude (numeric, nullable) — longitude from source
- isp (text, nullable) — ISP name from source

## 2. wallet_screenings — new columns
- wallet_screening_id (integer, nullable, UNIQUE) — stable source ID for UPSERT
- risk_details (text, nullable) — all non-zero percentage categories from the
  original wallet screening report, including categories not classified as
  notable exposure

## 3. wallets — new column
- wallet_id (integer, nullable, UNIQUE) — stable source ID for UPSERT

## 4. Security
- No RLS policy changes. All existing policies remain intact.
- New columns are nullable so existing rows are not affected.
- UNIQUE constraints on the new integer surrogate keys prevent duplicate
  source IDs while allowing NULL for rows imported before this refresh.

## 5. Important notes
- The existing ip_device_events.ip_address column has NOT NULL with default ''.
  We relax it to nullable and remove the default so the Oct. 7 importer can
  store NULL for events where the IP address was not transcribed.
- event_id / wallet_screening_id / wallet_id are NOT primary keys. The UUID
  `id` column remains the primary key on every table. The integer IDs are
  supplementary UNIQUE columns used by the importer for UPSERT.
- No data is deleted, renamed, or type-changed by this migration.
*/

-- ── ip_device_events: relax ip_address, add new columns ──
ALTER TABLE ip_device_events ALTER COLUMN ip_address DROP NOT NULL;
ALTER TABLE ip_device_events ALTER COLUMN ip_address DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ip_device_events' AND column_name = 'event_id') THEN
    ALTER TABLE ip_device_events ADD COLUMN event_id integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ip_device_events' AND column_name = 'ip_score') THEN
    ALTER TABLE ip_device_events ADD COLUMN ip_score numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ip_device_events' AND column_name = 'modified_date_raw') THEN
    ALTER TABLE ip_device_events ADD COLUMN modified_date_raw text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ip_device_events' AND column_name = 'city_region_zip') THEN
    ALTER TABLE ip_device_events ADD COLUMN city_region_zip text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ip_device_events' AND column_name = 'hits') THEN
    ALTER TABLE ip_device_events ADD COLUMN hits integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ip_device_events' AND column_name = 'latitude') THEN
    ALTER TABLE ip_device_events ADD COLUMN latitude numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ip_device_events' AND column_name = 'longitude') THEN
    ALTER TABLE ip_device_events ADD COLUMN longitude numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ip_device_events' AND column_name = 'isp') THEN
    ALTER TABLE ip_device_events ADD COLUMN isp text;
  END IF;
END $$;

-- UNIQUE constraint on event_id (allows multiple NULLs)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'uq_ip_device_events_event_id') THEN
    ALTER TABLE ip_device_events ADD CONSTRAINT uq_ip_device_events_event_id UNIQUE (event_id);
  END IF;
END $$;

-- ── wallet_screenings: add wallet_screening_id + risk_details ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'wallet_screenings' AND column_name = 'wallet_screening_id') THEN
    ALTER TABLE wallet_screenings ADD COLUMN wallet_screening_id integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'wallet_screenings' AND column_name = 'risk_details') THEN
    ALTER TABLE wallet_screenings ADD COLUMN risk_details text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'uq_wallet_screenings_wallet_screening_id') THEN
    ALTER TABLE wallet_screenings ADD CONSTRAINT uq_wallet_screenings_wallet_screening_id UNIQUE (wallet_screening_id);
  END IF;
END $$;

-- ── wallets: add wallet_id ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'wallets' AND column_name = 'wallet_id') THEN
    ALTER TABLE wallets ADD COLUMN wallet_id integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'uq_wallets_wallet_id') THEN
    ALTER TABLE wallets ADD CONSTRAINT uq_wallets_wallet_id UNIQUE (wallet_id);
  END IF;
END $$;

-- ── Indexes for UPSERT lookups ──
CREATE INDEX IF NOT EXISTS idx_ip_device_events_event_id ON ip_device_events(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_screenings_sid ON wallet_screenings(wallet_screening_id) WHERE wallet_screening_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallets_wallet_id ON wallets(wallet_id) WHERE wallet_id IS NOT NULL;
