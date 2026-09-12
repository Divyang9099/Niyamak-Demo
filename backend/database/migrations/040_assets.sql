-- Migration 040: Asset Inventory module
-- Tracks physical assets: sensors, batteries, ground equipment, vehicles, computing, accessories

CREATE TABLE IF NOT EXISTS assets (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  name                TEXT          NOT NULL,
  asset_type          VARCHAR(50)   NOT NULL DEFAULT 'other'
                      CHECK (asset_type IN ('sensor','battery','ground_equipment','vehicle','computing','accessory','other')),
  category            VARCHAR(100),
  serial_number       VARCHAR(200),
  model               VARCHAR(200),
  manufacturer        VARCHAR(200),

  status              VARCHAR(30)   NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','in_use','maintenance','retired')),

  purchase_date       DATE,
  purchase_price      NUMERIC(14,2),
  current_value       NUMERIC(14,2),

  warranty_expiry     DATE,
  maintenance_due     DATE,

  location            VARCHAR(300),

  -- Optional links to other entities
  assigned_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  assigned_drone_id   UUID REFERENCES drones(id)   ON DELETE SET NULL,

  notes               TEXT,
  image_key           VARCHAR(500),

  created_by          UUID REFERENCES users(id)    ON DELETE SET NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assets_status       ON assets(status)               WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_type         ON assets(asset_type)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_project      ON assets(assigned_project_id)  WHERE assigned_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_drone        ON assets(assigned_drone_id)    WHERE assigned_drone_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_warranty     ON assets(warranty_expiry)      WHERE warranty_expiry IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_maintenance  ON assets(maintenance_due)      WHERE maintenance_due IS NOT NULL AND deleted_at IS NULL;
