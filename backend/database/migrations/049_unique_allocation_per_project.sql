-- Migration: 049_unique_allocation_per_project
-- Enforce: a pilot or a drone may be allocated to a given project ONLY ONCE.
--
-- Background: nothing prevented the same resource being allocated to the same
-- project twice (e.g. deleting + re-adding from the Resources tab). That created
-- duplicate allocations, which doubled deployment history and produced phantom
-- "Project ⇄ itself" scheduling conflicts on the dashboard Gantt.
--
-- The existing 012_allocation_unique_index migration intentionally left the
-- overlap GIST indexes NON-unique so that *cross-project* double-bookings can be
-- force-overridden. That stays. This migration only forbids duplicate resources
-- WITHIN one project, which is never valid.

-- 1. Materialise the set of duplicate allocations to delete. Within each project
--    rank allocations (primary first, then oldest) and drop any later allocation
--    that reuses a pilot or drone already claimed by a higher-ranked one.
CREATE TEMP TABLE _alloc_dupes ON COMMIT DROP AS
  WITH ranked AS (
    SELECT id, project_id, pilot_id, drone_id,
           ROW_NUMBER() OVER (
             PARTITION BY project_id
             ORDER BY is_primary DESC, created_at ASC, id ASC
           ) AS rn
    FROM allocations
  )
  SELECT later.id
  FROM ranked later
  JOIN ranked earlier
    ON earlier.project_id = later.project_id
   AND earlier.rn < later.rn
   AND (
        (later.pilot_id IS NOT NULL AND later.pilot_id = earlier.pilot_id)
     OR (later.drone_id IS NOT NULL AND later.drone_id = earlier.drone_id)
   );

-- 2. Remove override rows that reference a soon-to-be-deleted allocation
--    (covers FK setups without ON DELETE CASCADE).
DELETE FROM allocation_conflicts
  WHERE allocation_id IN (SELECT id FROM _alloc_dupes)
     OR conflicting_allocation_id IN (SELECT id FROM _alloc_dupes);

-- 3. Delete the duplicate allocations.
DELETE FROM allocations WHERE id IN (SELECT id FROM _alloc_dupes);

-- 4. Backstop unique indexes (partial — NULL resource columns are ignored, so an
--    allocation may hold a pilot but no drone, or vice-versa).
CREATE UNIQUE INDEX IF NOT EXISTS uq_allocations_project_pilot
  ON allocations (project_id, pilot_id) WHERE pilot_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_allocations_project_drone
  ON allocations (project_id, drone_id) WHERE drone_id IS NOT NULL;
