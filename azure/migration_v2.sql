-- Run this in Supabase SQL Editor (prod + test projects)

-- 1. Add new fields to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS blood_group TEXT;

-- 2. Add status tracking to fee_collections
ALTER TABLE fee_collections ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE fee_collections ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Backfill status for existing records
UPDATE fee_collections SET status = 'verified' WHERE receipt_url IS NOT NULL AND status IS NULL;
UPDATE fee_collections SET status = 'submitted' WHERE paid_amount > 0 AND status IS NULL;
UPDATE fee_collections SET status = 'pending' WHERE status IS NULL;

-- 3. Create payment_config table (singleton row)
CREATE TABLE IF NOT EXISTS payment_config (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upi_id       TEXT,
  upi_name     TEXT,
  upi_qr_url   TEXT,
  bank_name    TEXT,
  account_number TEXT,
  ifsc_code    TEXT,
  account_holder TEXT,
  branch       TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE payment_config DISABLE ROW LEVEL SECURITY;

-- Insert a default empty row if none exists
INSERT INTO payment_config (upi_id) SELECT '' WHERE NOT EXISTS (SELECT 1 FROM payment_config);
