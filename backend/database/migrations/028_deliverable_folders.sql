-- Migration 028: Deliverable folders.
-- A folder upload now creates ONE folder deliverable (is_folder=true, no file)
-- with the individual files as children (parent_id → folder). Lets the UI show
-- a single collapsible folder row instead of N separate file rows, and lets the
-- backend send a single notification/email per folder instead of one per file.

ALTER TABLE deliverables
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES deliverables(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_folder BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_deliverables_parent ON deliverables(parent_id);

-- One folder per (project, name) — makes find-or-create race-safe under parallel
-- chunk uploads (the losing INSERT fails the constraint and falls back to SELECT).
CREATE UNIQUE INDEX IF NOT EXISTS uq_deliverable_folder
  ON deliverables(project_id, name) WHERE is_folder = TRUE;
