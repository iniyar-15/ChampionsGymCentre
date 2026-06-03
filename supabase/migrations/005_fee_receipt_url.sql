-- Add receipt storage path to fee collections
ALTER TABLE fee_collections ADD COLUMN IF NOT EXISTS receipt_url TEXT;
