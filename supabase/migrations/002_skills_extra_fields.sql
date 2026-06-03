-- Add category, description, value columns to skills
ALTER TABLE skills ADD COLUMN IF NOT EXISTS category    TEXT;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS value       TEXT;