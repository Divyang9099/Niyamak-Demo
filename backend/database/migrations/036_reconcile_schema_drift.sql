-- Migration 036: reconcile schema drift.
--
-- The following tables/columns are USED by backend code but were only ever present
-- in the baselined dev database — no prior migration creates them. On a fresh
-- (production) deploy they would be missing and the corresponding features would
-- throw at runtime. Every statement here is idempotent, so it is safe on the
-- existing live DB (which already has most of these) and on a clean DB alike.

-- ── 1. project_kml_uploads ────────────────────────────────────────────────────
-- Used by map.controller.js and projectDocs.controller.js (INSERT + SELECT).
-- Without this table, KML boundary upload/import 500s on a fresh deploy.
CREATE TABLE IF NOT EXISTS project_kml_uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kml_key       TEXT,
  geojson_data  JSONB,
  center_lat    DOUBLE PRECISION,
  center_lng    DOUBLE PRECISION,
  bbox          JSONB,
  area_sqm      DOUBLE PRECISION,
  feature_count INTEGER,
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_kml_uploads_project ON project_kml_uploads(project_id);

-- ── 2. scheduler_state ────────────────────────────────────────────────────────
-- scheduler.js currently CREATE-IF-NOT-EXISTS's this at runtime. Declare it in a
-- migration so the schema is owned by migrations, not hidden in app startup code.
CREATE TABLE IF NOT EXISTS scheduler_state (
  key       TEXT PRIMARY KEY,
  last_run  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Columns used by services but not created by any migration ──────────────
ALTER TABLE drones        ADD COLUMN IF NOT EXISTS sensor_type TEXT;               -- drone.service.js INSERT/SELECT/UPDATE
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_type TEXT;               -- notification.service.createNotification
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id   UUID;               -- notification.service.createNotification
ALTER TABLE pilots        ADD COLUMN IF NOT EXISTS certification TEXT;             -- pilot.service.js INSERT/UPDATE
ALTER TABLE users         ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[]; -- declared in 024, absent on baselined DBs

-- ── 4. drones.sensor_payloads type reconciliation ─────────────────────────────
-- Migration 014 created this as text[]; the live schema and working code use jsonb.
-- Converge to jsonb so a fresh deploy behaves exactly like production.
-- to_jsonb() is a no-op when the column is already jsonb, and converts a text[] to a
-- JSON array on a freshly-migrated DB (which is empty, so there is no data risk).
ALTER TABLE drones ALTER COLUMN sensor_payloads TYPE JSONB USING to_jsonb(sensor_payloads);
