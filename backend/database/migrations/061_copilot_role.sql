-- Migration: 061_copilot_role
-- Purpose: Adds 'co_pilot' role, crew_role distinction, and copilot_id to allocations.

-- 1. Extend users.role check constraint to include 'co_pilot'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['admin', 'project_manager', 'pilot', 'super_admin', 'co_pilot']));

-- 2. Add crew_role to pilots table ('pilot' vs 'co_pilot')
-- Reusing the pilots table ensures full compatibility with profiles, documents, tracking & attendance
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS crew_role TEXT
  CHECK (crew_role IN ('pilot', 'co_pilot')) DEFAULT 'pilot';

UPDATE pilots SET crew_role = 'pilot' WHERE crew_role IS NULL;
CREATE INDEX IF NOT EXISTS idx_pilots_crew_role ON pilots(crew_role);

-- 3. Add copilot_id to allocations table
-- Links to pilots table where crew_role = 'co_pilot'
ALTER TABLE allocations
  ADD COLUMN IF NOT EXISTS copilot_id UUID REFERENCES pilots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_allocations_copilot ON allocations(copilot_id);
