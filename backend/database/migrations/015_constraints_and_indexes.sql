-- ============================================================
-- Migration 015: Unique constraints and indexes for safety
-- ============================================================

-- Remove duplicate project_maps rows (keep latest per project_id)
DELETE FROM project_maps
WHERE id NOT IN (
  SELECT DISTINCT ON (project_id) id
  FROM project_maps
  ORDER BY project_id, created_at DESC
);

-- Unique constraint allows ON CONFLICT upsert in map.service.saveMapData
ALTER TABLE project_maps DROP CONSTRAINT IF EXISTS project_maps_project_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS project_maps_project_id_key ON project_maps(project_id);

-- Partial index to speed up expired upload_sessions orphan detection
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expired
  ON upload_sessions(expires_at) WHERE status = 'active';
