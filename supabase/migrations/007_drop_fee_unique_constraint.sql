-- Allow multiple fee payment records per student per month
ALTER TABLE fee_collections
  DROP CONSTRAINT IF EXISTS fee_collections_month_student_id_key;
