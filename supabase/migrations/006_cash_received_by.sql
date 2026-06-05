ALTER TABLE fee_collections
  ADD COLUMN IF NOT EXISTS cash_received_by UUID REFERENCES users(id) ON DELETE SET NULL;
