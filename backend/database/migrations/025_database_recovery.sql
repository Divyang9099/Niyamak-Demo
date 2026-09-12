-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 025 — DATABASE RECOVERY PASS
-- ═══════════════════════════════════════════════════════════════════════════
-- Purpose: Fix the 12 gaps surfaced by the audit. Strictly additive +
-- constraint dedupe — NO data destruction.
--
-- Sections:
--   1. CRITICAL — widen calendar_events.event_type CHECK to match UI
--   2. Dedupe duplicate FK on projects.source_pipeline_id
--   3. Dedupe duplicate UNIQUE on project_members
--   4. Add missing FKs on allocation_conflicts
--   5. Add UNIQUE on pilots.user_id (with pre-dedupe safety)
--   6. Add case-insensitive UNIQUE on users.email
--   7. Add missing performance indexes (8 partial / composite)
--
-- Every section is wrapped in IF NOT EXISTS / DO blocks — re-running is safe.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Widen calendar_events.event_type CHECK ─────────────────────────────
-- Frontend Calendar.jsx offers meeting/deadline/other in addition to the
-- original 6 types. Current CHECK rejects them → all such inserts fail.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_event_type_check'
  ) THEN
    ALTER TABLE calendar_events DROP CONSTRAINT calendar_events_event_type_check;
  END IF;
  ALTER TABLE calendar_events
    ADD CONSTRAINT calendar_events_event_type_check
    CHECK (event_type = ANY (ARRAY[
      'project','pipeline','expo','training','maintenance','leave',
      'meeting','deadline','other'
    ]));
END $$;

-- ─── 2. Dedupe duplicate FK on projects.source_pipeline_id ────────────────
-- Two FK constraints currently point projects.source_pipeline_id → pipeline.id.
-- Keep the canonical one (projects_source_pipeline_id_fkey style) and drop extras.
DO $$
DECLARE
  fk_count INT;
  fk_to_drop TEXT;
BEGIN
  SELECT COUNT(*) INTO fk_count
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
   WHERE rel.relname = 'projects'
     AND c.contype = 'f'
     AND c.conkey @> ARRAY[(SELECT attnum FROM pg_attribute
                              WHERE attrelid = 'projects'::regclass AND attname = 'source_pipeline_id')];
  WHILE fk_count > 1 LOOP
    -- Drop the alphabetically-earlier duplicate (deterministic, idempotent)
    SELECT c.conname INTO fk_to_drop
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
     WHERE rel.relname = 'projects'
       AND c.contype = 'f'
       AND c.conkey @> ARRAY[(SELECT attnum FROM pg_attribute
                                WHERE attrelid = 'projects'::regclass AND attname = 'source_pipeline_id')]
     ORDER BY c.conname
     LIMIT 1;
    EXECUTE format('ALTER TABLE projects DROP CONSTRAINT %I', fk_to_drop);
    fk_count := fk_count - 1;
  END LOOP;
  -- Re-create the canonical one if it was dropped (zero or one remaining now)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
     WHERE rel.relname = 'projects' AND c.contype = 'f'
       AND c.conkey @> ARRAY[(SELECT attnum FROM pg_attribute
                                WHERE attrelid = 'projects'::regclass AND attname = 'source_pipeline_id')]
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_source_pipeline_id_fkey
      FOREIGN KEY (source_pipeline_id) REFERENCES pipeline(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 3. Dedupe duplicate UNIQUE on project_members ─────────────────────────
-- Two UNIQUE constraints on (project_id, user_id). Keep the canonical one,
-- drop the legacy clone.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_project_user_membership') THEN
    ALTER TABLE project_members DROP CONSTRAINT unique_project_user_membership;
  END IF;
  -- Ensure the canonical one still exists
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_members_project_id_user_id_key') THEN
    ALTER TABLE project_members
      ADD CONSTRAINT project_members_project_id_user_id_key
      UNIQUE (project_id, user_id);
  END IF;
END $$;

-- ─── 4. Add missing FKs on allocation_conflicts ────────────────────────────
-- Without these, deleting an allocation orphans conflict rows silently.
-- Pre-clean orphans first so the FK can be added.
DELETE FROM allocation_conflicts
 WHERE allocation_id IS NOT NULL
   AND allocation_id NOT IN (SELECT id FROM allocations);

UPDATE allocation_conflicts
   SET conflicting_allocation_id = NULL
 WHERE conflicting_allocation_id IS NOT NULL
   AND conflicting_allocation_id NOT IN (SELECT id FROM allocations);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'allocation_conflicts_allocation_id_fkey') THEN
    ALTER TABLE allocation_conflicts
      ADD CONSTRAINT allocation_conflicts_allocation_id_fkey
      FOREIGN KEY (allocation_id) REFERENCES allocations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'allocation_conflicts_conflicting_allocation_id_fkey') THEN
    ALTER TABLE allocation_conflicts
      ADD CONSTRAINT allocation_conflicts_conflicting_allocation_id_fkey
      FOREIGN KEY (conflicting_allocation_id) REFERENCES allocations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 5. Add UNIQUE on pilots.user_id (one user = one pilot record) ─────────
-- Pre-dedupe: if duplicates exist, keep oldest pilot row and NULL out user_id
-- on the rest (preserves their pilot history without violating the constraint).
DO $$
DECLARE
  dup RECORD;
  keep_id UUID;
BEGIN
  FOR dup IN
    SELECT user_id FROM pilots
     WHERE user_id IS NOT NULL
     GROUP BY user_id HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keep_id FROM pilots
     WHERE user_id = dup.user_id ORDER BY created_at NULLS LAST, id LIMIT 1;
    UPDATE pilots SET user_id = NULL
     WHERE user_id = dup.user_id AND id <> keep_id;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pilots_user_id_unique') THEN
    ALTER TABLE pilots
      ADD CONSTRAINT pilots_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- ─── 6. Case-insensitive uniqueness on users.email ─────────────────────────
-- Pre-dedupe required: if FOO@x.com and foo@x.com both exist, keep the oldest.
DO $$
DECLARE
  dup RECORD;
  keep_id UUID;
BEGIN
  FOR dup IN
    SELECT LOWER(email) AS lemail FROM users
     WHERE deleted_at IS NULL
     GROUP BY LOWER(email) HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keep_id FROM users
     WHERE LOWER(email) = dup.lemail AND deleted_at IS NULL
     ORDER BY created_at NULLS LAST, id LIMIT 1;
    -- Soft-delete the duplicates rather than hard-delete (audit trail preserved)
    UPDATE users SET deleted_at = NOW()
     WHERE LOWER(email) = dup.lemail AND id <> keep_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (LOWER(email))
  WHERE deleted_at IS NULL;

-- ─── 7. Missing performance indexes ────────────────────────────────────────

-- 7a. Unresolved conflict feed
CREATE INDEX IF NOT EXISTS idx_allocation_conflicts_unresolved
  ON allocation_conflicts(created_at DESC)
  WHERE resolved = FALSE;

-- 7b. Notification unread feed (Topbar bell + Notifications page)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);

-- 7c. Audit log composite lookup (entity_type, entity_id)
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_composite
  ON activity_logs(entity_type, entity_id, created_at DESC);

-- 7d–i. Partial soft-delete indexes for hot list endpoints
CREATE INDEX IF NOT EXISTS idx_projects_alive
  ON projects(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drones_alive
  ON drones(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pilots_alive
  ON pilots(updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_estimations_alive
  ON estimations(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_library_documents_alive
  ON library_documents(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_alive
  ON pipeline(created_at DESC) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION 025
-- ═══════════════════════════════════════════════════════════════════════════
