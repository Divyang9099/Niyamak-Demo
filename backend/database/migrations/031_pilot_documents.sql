-- Pilot identity documents and direct contact number
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS contact_number    TEXT;
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS aadhaar_doc_key   TEXT;
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS passport_doc_key  TEXT;
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS certificate_doc_key TEXT;
