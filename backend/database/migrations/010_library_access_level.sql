-- =============================================================
-- Migration: 010_library_access_level
-- Description: Adds access_level and archived_at to library_documents
-- =============================================================

-- Role-based visibility control
ALTER TABLE library_documents
  ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'all'
    CHECK (access_level IN ('all', 'admin_only'));

-- Soft-archive support (separate from soft-delete)
ALTER TABLE library_documents
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
