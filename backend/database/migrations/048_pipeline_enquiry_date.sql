-- Add enquiry_date to pipeline: the user-specified date the opportunity was received.
-- Defaults to the row's created_at date so existing records stay meaningful.
ALTER TABLE pipeline
  ADD COLUMN IF NOT EXISTS enquiry_date DATE;

UPDATE pipeline
  SET enquiry_date = created_at::date
  WHERE enquiry_date IS NULL;
