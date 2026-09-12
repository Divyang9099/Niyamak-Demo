-- ============================================================
-- Migration 013: Enterprise Upload Infrastructure
-- Adds chunked upload sessions, deliverable lifecycle expansion,
-- deliverable versioning, and file_size tracking on documents.
-- ============================================================

-- ── 1. Upload Sessions (chunked / multipart upload tracking) ──────────────────
CREATE TABLE IF NOT EXISTS upload_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     VARCHAR(50)   NOT NULL,          -- 'deliverable' | 'document' | 'library'
  entity_id       UUID,                             -- linked deliverable/document id (set on complete)
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  r2_upload_id    VARCHAR(1000) NOT NULL,           -- S3/R2 multipart upload ID
  r2_key          VARCHAR(1000) NOT NULL,           -- destination R2 object key
  file_name       VARCHAR(500)  NOT NULL,
  file_size       BIGINT,                           -- total file size in bytes (client-reported)
  mime_type       VARCHAR(200),
  chunk_size      INTEGER       DEFAULT 10485760,   -- 10 MB default chunk
  total_chunks    INTEGER,
  uploaded_parts  JSONB         DEFAULT '[]'::jsonb, -- [{partNumber, etag}]
  status          VARCHAR(30)   DEFAULT 'active'
                  CHECK (status IN ('active','completed','aborted','expired')),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata        JSONB         DEFAULT '{}'::jsonb,
  expires_at      TIMESTAMP     NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_entity  ON upload_sessions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_user    ON upload_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status  ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_project ON upload_sessions(project_id);

-- ── 2. Deliverable lifecycle expansion ────────────────────────────────────────
-- Add new columns; widen status enum to support full PRD lifecycle.

DO $$
BEGIN
  -- file_size
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='deliverables' AND column_name='file_size'
  ) THEN
    ALTER TABLE deliverables ADD COLUMN file_size BIGINT;
  END IF;

  -- checksum (SHA-256 hex)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='deliverables' AND column_name='checksum'
  ) THEN
    ALTER TABLE deliverables ADD COLUMN checksum VARCHAR(64);
  END IF;

  -- extracted metadata (duration, resolution, bounds, etc.)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='deliverables' AND column_name='metadata'
  ) THEN
    ALTER TABLE deliverables ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- thumbnail R2 key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='deliverables' AND column_name='thumbnail_key'
  ) THEN
    ALTER TABLE deliverables ADD COLUMN thumbnail_key VARCHAR(1000);
  END IF;

  -- rejection reason when PM rejects a deliverable
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='deliverables' AND column_name='rejected_reason'
  ) THEN
    ALTER TABLE deliverables ADD COLUMN rejected_reason TEXT;
  END IF;

  -- rejected_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='deliverables' AND column_name='rejected_by'
  ) THEN
    ALTER TABLE deliverables ADD COLUMN rejected_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- rejected_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='deliverables' AND column_name='rejected_at'
  ) THEN
    ALTER TABLE deliverables ADD COLUMN rejected_at TIMESTAMP;
  END IF;

  -- upload session link
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='deliverables' AND column_name='upload_session_id'
  ) THEN
    ALTER TABLE deliverables ADD COLUMN upload_session_id UUID REFERENCES upload_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Widen status to include full lifecycle values
ALTER TABLE deliverables
  DROP CONSTRAINT IF EXISTS deliverables_status_check;

ALTER TABLE deliverables
  ADD CONSTRAINT deliverables_status_check
  CHECK (status IN ('pending','uploading','processing','uploaded','approved','rejected'));

-- ── 3. Deliverable version history ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliverable_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id  UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  file_key        VARCHAR(1000),
  file_name       VARCHAR(500),
  file_size       BIGINT,
  version         VARCHAR(20)  NOT NULL,
  uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_del_versions_deliverable ON deliverable_versions(deliverable_id);

-- ── 4. Project documents — add file_size, checksum ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='project_documents' AND column_name='file_size'
  ) THEN
    ALTER TABLE project_documents ADD COLUMN file_size BIGINT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='project_documents' AND column_name='mime_type'
  ) THEN
    ALTER TABLE project_documents ADD COLUMN mime_type VARCHAR(200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='project_documents' AND column_name='checksum'
  ) THEN
    ALTER TABLE project_documents ADD COLUMN checksum VARCHAR(64);
  END IF;
END $$;

-- ── 5. Library documents — add checksum if missing ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='library_documents' AND column_name='checksum'
  ) THEN
    ALTER TABLE library_documents ADD COLUMN checksum VARCHAR(64);
  END IF;
END $$;

-- ── 6. KML source files on project_maps ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='project_maps' AND column_name='kml_key'
  ) THEN
    ALTER TABLE project_maps ADD COLUMN kml_key VARCHAR(1000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='project_maps' AND column_name='bbox'
  ) THEN
    ALTER TABLE project_maps ADD COLUMN bbox JSONB;  -- [minLng, minLat, maxLng, maxLat]
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='project_maps' AND column_name='area_sqm'
  ) THEN
    ALTER TABLE project_maps ADD COLUMN area_sqm NUMERIC(18,4);
  END IF;
END $$;

-- ── 7. ZIP bundle tracking ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliverable_bundles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status      VARCHAR(30) DEFAULT 'queued'
              CHECK (status IN ('queued','processing','ready','failed')),
  r2_key      VARCHAR(1000),
  presigned_url TEXT,
  url_expires_at TIMESTAMP,
  file_count  INTEGER,
  total_size  BIGINT,
  error_msg   TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bundles_project ON deliverable_bundles(project_id);
CREATE INDEX IF NOT EXISTS idx_bundles_user    ON deliverable_bundles(requested_by);
