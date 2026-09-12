-- ============================================================
-- Migration 016: Add project_id to calendar_events
-- Enables project-conversion to auto-create a calendar entry
-- that is visible when no allocation exists yet (pre-allocation phase).
-- ============================================================
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_calendar_events_project
  ON calendar_events(project_id) WHERE project_id IS NOT NULL;
