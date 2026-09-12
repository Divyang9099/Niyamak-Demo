-- Migration 054: Add name column to estimations
-- Allows each estimation to have a user-defined scenario name
-- (e.g. "Base Case", "Optimistic – Low Drone Days", etc.)

ALTER TABLE estimations
  ADD COLUMN IF NOT EXISTS name TEXT;

COMMENT ON COLUMN estimations.name IS 'User-defined scenario label for the estimation, e.g. "Base Case", "Optimistic".';
