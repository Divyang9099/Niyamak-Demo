-- Migration 039: project_drones — team drone assignments without formal date allocation
-- Drones can be associated with a project as "team drones" without a specific date window.
-- This mirrors how pilots appear via project_members when not formally allocated.

CREATE TABLE IF NOT EXISTS project_drones (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  drone_id   UUID        NOT NULL REFERENCES drones(id)    ON DELETE CASCADE,
  added_by   UUID        REFERENCES users(id)              ON DELETE SET NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, drone_id)
);

CREATE INDEX IF NOT EXISTS idx_project_drones_project ON project_drones(project_id);
CREATE INDEX IF NOT EXISTS idx_project_drones_drone   ON project_drones(drone_id);
