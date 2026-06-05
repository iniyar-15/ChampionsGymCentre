-- Add 'confirmed' status to competition shortlist
ALTER TABLE competition_shortlist
  DROP CONSTRAINT IF EXISTS competition_shortlist_status_check;

ALTER TABLE competition_shortlist
  ADD CONSTRAINT competition_shortlist_status_check
  CHECK (status IN ('shortlisted', 'finalized', 'removed', 'confirmed'));

-- Track student's competition fee payment confirmation
ALTER TABLE competition_shortlist
  ADD COLUMN IF NOT EXISTS entry_fee_paid BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS entry_fee_payment_mode TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
