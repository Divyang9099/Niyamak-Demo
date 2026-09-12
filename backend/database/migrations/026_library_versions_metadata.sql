-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 026 — library_versions metadata columns
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds file_name, file_size, file_type, uploaded_by, and notes to
-- library_versions so the version history modal can display rich info.
-- All columns are nullable so existing rows are unaffected.

ALTER TABLE library_versions
  ADD COLUMN IF NOT EXISTS file_name   TEXT,
  ADD COLUMN IF NOT EXISTS file_size   BIGINT,
  ADD COLUMN IF NOT EXISTS file_type   TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes       TEXT;
