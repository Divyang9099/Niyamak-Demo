-- ============================================================
-- Migration 014: Add all columns referenced in code but missing from schema
-- ============================================================

-- ── 1. drones — add make, sensor_payloads, day_rate, updated_at ───────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drones' AND column_name='make') THEN
    ALTER TABLE drones ADD COLUMN make TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drones' AND column_name='sensor_payloads') THEN
    ALTER TABLE drones ADD COLUMN sensor_payloads JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drones' AND column_name='day_rate') THEN
    ALTER TABLE drones ADD COLUMN day_rate NUMERIC(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drones' AND column_name='updated_at') THEN
    ALTER TABLE drones ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;
END $$;

-- ── 2. estimations — add pipeline_id FK ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='estimations' AND column_name='pipeline_id') THEN
    ALTER TABLE estimations ADD COLUMN pipeline_id UUID REFERENCES pipeline(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 3. deliverables — add approved_by, approved_at ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deliverables' AND column_name='approved_by') THEN
    ALTER TABLE deliverables ADD COLUMN approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deliverables' AND column_name='approved_at') THEN
    ALTER TABLE deliverables ADD COLUMN approved_at TIMESTAMP;
  END IF;
END $$;

-- ── 4. projects — add updated_at ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='updated_at') THEN
    ALTER TABLE projects ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;
END $$;

-- ── 5. company_config — add cost engine defaults ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_config' AND column_name='default_overhead_percent') THEN
    ALTER TABLE company_config ADD COLUMN default_overhead_percent NUMERIC(5,2) DEFAULT 10;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_config' AND column_name='default_margin_percent') THEN
    ALTER TABLE company_config ADD COLUMN default_margin_percent NUMERIC(5,2) DEFAULT 20;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_config' AND column_name='default_contingency_percent') THEN
    ALTER TABLE company_config ADD COLUMN default_contingency_percent NUMERIC(5,2) DEFAULT 5;
  END IF;
END $$;

-- ── 6. Add index for estimation pipeline_id lookups ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_estimations_pipeline ON estimations(pipeline_id) WHERE pipeline_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimations_project  ON estimations(project_id)  WHERE project_id  IS NOT NULL;
