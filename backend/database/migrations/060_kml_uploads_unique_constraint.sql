-- Migration 060: Add unique constraint on project_kml_uploads(project_id, kml_key)
-- This prevents duplicate KML layer rows when the same document is "Load on Map"-ed
-- multiple times. The backend upsert (ON CONFLICT DO UPDATE) relies on this constraint.
--
-- Existing duplicates must be collapsed first, otherwise ADD CONSTRAINT fails.
-- Rows with a NULL kml_key (manual uploads) are untouched: Postgres treats NULLs as
-- distinct, so they never collide.

-- 1. Collapse pre-existing duplicates, keeping the most recent row of each pair.
DELETE FROM project_kml_uploads k
USING project_kml_uploads newer
WHERE k.kml_key IS NOT NULL
  AND k.project_id = newer.project_id
  AND k.kml_key    = newer.kml_key
  AND k.id         < newer.id;

-- 2. Add the constraint only if it isn't already there, so re-running is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_project_kml_uploads_project_kmlkey'
  ) THEN
    ALTER TABLE project_kml_uploads
      ADD CONSTRAINT uq_project_kml_uploads_project_kmlkey
      UNIQUE (project_id, kml_key);
  END IF;
END $$;
