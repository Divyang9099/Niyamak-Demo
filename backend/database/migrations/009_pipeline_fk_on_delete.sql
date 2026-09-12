-- Migration 009: Fix pipeline FK constraints to use ON DELETE SET NULL
-- Prevents orphaned pipeline records when pilots or drones are soft/hard deleted.

ALTER TABLE pipeline
  DROP CONSTRAINT IF EXISTS pipeline_tentative_pilot_fkey,
  DROP CONSTRAINT IF EXISTS pipeline_tentative_drone_fkey;

ALTER TABLE pipeline
  ADD CONSTRAINT pipeline_tentative_pilot_fkey
    FOREIGN KEY (tentative_pilot) REFERENCES pilots(id) ON DELETE SET NULL,
  ADD CONSTRAINT pipeline_tentative_drone_fkey
    FOREIGN KEY (tentative_drone) REFERENCES drones(id) ON DELETE SET NULL;
