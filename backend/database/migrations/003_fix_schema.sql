-- =============================================================
-- VARUNA NEXUS — Migration 002: Fix schema issues
-- =============================================================

-- FIX 1: Rename file_url -> file_key in all 4 tables
-- (These already exist in migrate-r2-columns.js but must be in migration chain)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='project_documents' AND column_name='file_url')
  THEN ALTER TABLE project_documents RENAME COLUMN file_url TO file_key; END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='deliverables' AND column_name='file_url')
  THEN ALTER TABLE deliverables RENAME COLUMN file_url TO file_key; END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='library_documents' AND column_name='file_url')
  THEN ALTER TABLE library_documents RENAME COLUMN file_url TO file_key; END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='library_versions' AND column_name='file_url')
  THEN ALTER TABLE library_versions RENAME COLUMN file_url TO file_key; END IF;
END $$;

-- FIX 2: Add file_name column to library_documents (missing for download)
ALTER TABLE library_documents ADD COLUMN IF NOT EXISTS file_name TEXT;

-- FIX 3: Fix pipeline stage CHECK constraint to include 'converted'
ALTER TABLE pipeline DROP CONSTRAINT IF EXISTS pipeline_stage_check;
ALTER TABLE pipeline ADD CONSTRAINT pipeline_stage_check
  CHECK (stage IN ('enquiry','proposal','negotiation',
                   'verbal_confirmation','lost','converted'));

-- FIX 4: Add ON DELETE SET NULL to pilots.user_id to prevent crash on user delete
ALTER TABLE pilots DROP CONSTRAINT IF EXISTS pilots_user_id_fkey;
ALTER TABLE pilots ADD CONSTRAINT pilots_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- FIX 5: Add missing performance indexes
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_allocations_pilot_id    ON allocations(pilot_id);
CREATE INDEX IF NOT EXISTS idx_allocations_drone_id    ON allocations(drone_id);
CREATE INDEX IF NOT EXISTS idx_library_docs_category   ON library_documents(category_id);

-- FIX 6: Add deleted_at soft-delete columns to key tables
ALTER TABLE projects          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE pipeline          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE estimations        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE library_documents  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- =============================================================
-- END MIGRATION 002
-- =============================================================
