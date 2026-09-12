-- Add PO and WO number fields to pipeline so onboarding stage captures them as text inputs
-- (the onboarding_doc_url column is retained for the signed agreement document)
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS onboarding_po_number TEXT;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS onboarding_wo_number TEXT;
