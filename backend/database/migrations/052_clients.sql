-- Migration 052: Client module
--
-- Introduces a first-class `clients` table and links projects + pipeline to it via
-- a nullable client_id FK. The existing free-text `client_name` column is KEPT and
-- kept in sync (denormalised) so every current list/query/display keeps working and
-- no historical data is lost. A one-time backfill converts the distinct client_name
-- values already in the DB into client records and links the rows.

CREATE TABLE IF NOT EXISTS clients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  company_name   TEXT,
  contact_person TEXT,
  contact_email  TEXT,
  contact_number TEXT,
  gstin          TEXT,
  address        TEXT,
  city           TEXT,
  state          TEXT,
  website        TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

-- Case-insensitive unique client name among live (non-deleted) clients so the
-- inline "add client" flow can't create duplicates like "NTPC" vs "ntpc".
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_name_ci
  ON clients (LOWER(name)) WHERE deleted_at IS NULL;

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Link columns (nullable, ON DELETE SET NULL so removing a client never breaks a
-- project/pipeline — the denormalised client_name is retained as history).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_client ON pipeline(client_id);

-- ── Backfill: one client per distinct existing client_name (projects ∪ pipeline) ──
-- Dedupe by LOWER(TRIM(name)) — the unique index is case-insensitive, so names that
-- differ only by case/whitespace (e.g. "X-Way" vs "x-way") must collapse to a single
-- client. DISTINCT ON picks one representative spelling per lowercased name.
INSERT INTO clients (name)
SELECT DISTINCT ON (LOWER(TRIM(client_name))) TRIM(client_name)
FROM (
  SELECT client_name FROM projects WHERE client_name IS NOT NULL AND TRIM(client_name) <> ''
  UNION ALL
  SELECT client_name FROM pipeline WHERE client_name IS NOT NULL AND TRIM(client_name) <> ''
) s
WHERE NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE LOWER(c.name) = LOWER(TRIM(s.client_name)) AND c.deleted_at IS NULL
)
ORDER BY LOWER(TRIM(client_name)), TRIM(client_name);

-- Link existing rows to the backfilled clients by name.
UPDATE projects p SET client_id = c.id
FROM clients c
WHERE p.client_id IS NULL
  AND p.client_name IS NOT NULL
  AND LOWER(TRIM(p.client_name)) = LOWER(c.name)
  AND c.deleted_at IS NULL;

UPDATE pipeline pl SET client_id = c.id
FROM clients c
WHERE pl.client_id IS NULL
  AND pl.client_name IS NOT NULL
  AND LOWER(TRIM(pl.client_name)) = LOWER(c.name)
  AND c.deleted_at IS NULL;
