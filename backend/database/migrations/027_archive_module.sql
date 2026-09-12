-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 027 — Archive Module
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds archived_at + archived_by to projects so the central Archive module
-- has a consistent timestamp/actor across all entity types.
-- Also adds archived_by to library_documents for the same reason.
-- All columns are nullable — existing rows are unaffected.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE library_documents
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES users(id) ON DELETE SET NULL;

-- Index for efficient archive listing queries
CREATE INDEX IF NOT EXISTS idx_projects_archived_at         ON projects(archived_at)         WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_library_documents_archived_at ON library_documents(archived_at) WHERE archived_at IS NOT NULL;
