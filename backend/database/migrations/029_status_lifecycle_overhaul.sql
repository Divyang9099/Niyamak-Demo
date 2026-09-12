-- ============================================================================
-- 029_status_lifecycle_overhaul.sql
--
-- Reworks the project + pipeline lifecycles per the new operational model.
--
-- PROJECT statuses:  initiate → planned → on_going → executed → complete
--                    (+ cancelled, terminal & archived)
-- PIPELINE stages:   inquiry → commercial_proposal → pre_confirmation →
--                    onboarding → converted (+ cancelled, terminal & archived)
--
-- Also adds lifecycle-supporting columns: contact details, invoice on complete,
-- pipeline stage attachments, and cancellation reasons.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- PROJECTS — status migration
-- ─────────────────────────────────────────────────────────────
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

UPDATE projects SET status = CASE status
  WHEN 'enquiry'         THEN 'initiate'
  WHEN 'confirmed'       THEN 'planned'
  WHEN 'in_progress'     THEN 'on_going'
  WHEN 'post_processing' THEN 'executed'
  WHEN 'delivered'       THEN 'complete'
  WHEN 'on_hold'         THEN 'planned'
  WHEN 'cancelled'       THEN 'cancelled'
  ELSE 'initiate'
END;

ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'initiate';

ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('initiate','planned','on_going','executed','complete','cancelled'));

-- New project columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contact_number      TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contact_email       TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS invoice_url         TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS invoice_uploaded_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cancel_reason       TEXT;
-- Flags a project converted from pipeline that still needs core details/allocation
ALTER TABLE projects ADD COLUMN IF NOT EXISTS needs_attention     BOOLEAN NOT NULL DEFAULT FALSE;

-- ─────────────────────────────────────────────────────────────
-- PIPELINE — stage migration
-- ─────────────────────────────────────────────────────────────
ALTER TABLE pipeline DROP CONSTRAINT IF EXISTS pipeline_stage_check;

UPDATE pipeline SET stage = CASE stage
  WHEN 'enquiry'             THEN 'inquiry'
  WHEN 'proposal'            THEN 'commercial_proposal'
  WHEN 'negotiation'         THEN 'pre_confirmation'
  WHEN 'verbal_confirmation' THEN 'onboarding'
  WHEN 'lost'                THEN 'cancelled'
  WHEN 'converted'           THEN 'converted'
  ELSE 'inquiry'
END;

ALTER TABLE pipeline ALTER COLUMN stage SET DEFAULT 'inquiry';

ALTER TABLE pipeline ADD CONSTRAINT pipeline_stage_check
  CHECK (stage IN ('inquiry','commercial_proposal','pre_confirmation','onboarding','converted','cancelled'));

-- New pipeline columns
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS requirement        TEXT;  -- inquiry: client requirement
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS estimation_notes   TEXT;  -- inquiry: internal estimation
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS quotation_url      TEXT;  -- commercial_proposal: quotation file
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS proposal_email_url TEXT;  -- pre_confirmation: email/whatsapp proof
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS onboarding_doc_url TEXT;  -- onboarding: PO/WO/agreement
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS cancel_reason      TEXT;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS contact_number     TEXT;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS contact_email      TEXT;
