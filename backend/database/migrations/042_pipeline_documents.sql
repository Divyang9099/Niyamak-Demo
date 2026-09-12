-- ============================================================================
-- 042_pipeline_documents.sql
--
-- Pipeline Documents — a per-lead document checklist (Quotation, Confirmation,
-- Agreement, PO, WO …). Each row is a named slot that may or may not have a file
-- attached. Replaces the old stage-gated quotation_url / proposal_email_url /
-- onboarding_doc_url columns as the primary document store (those columns are
-- kept for backward compatibility with already-converted leads).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_documents (
  id           UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id  UUID         NOT NULL REFERENCES pipeline(id) ON DELETE CASCADE,
  name         TEXT         NOT NULL,
  file_key     TEXT,                       -- R2 object key; NULL until a file is attached
  file_name    TEXT,                       -- original uploaded filename
  file_size    BIGINT,
  is_default   BOOLEAN      NOT NULL DEFAULT FALSE,  -- part of the seeded standard checklist
  sort_order   INT          NOT NULL DEFAULT 0,
  uploaded_by  UUID         REFERENCES users(id),
  uploaded_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pipeline_documents_pipeline_id_idx ON pipeline_documents(pipeline_id);
