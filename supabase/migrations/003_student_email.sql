-- Add email field to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT;
