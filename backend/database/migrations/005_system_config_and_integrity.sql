-- =============================================================
-- Migration: 005_system_config_and_integrity
-- Description: Adds company config, rate cards, and fixes integrity gaps
-- =============================================================

-- 1. Company Configuration Table (PRD §10.1)
CREATE TABLE IF NOT EXISTS company_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name    TEXT NOT NULL,
    logo_url        TEXT,
    address         TEXT,
    gstin           TEXT,
    cin             TEXT,
    financial_year_start INT DEFAULT 4, -- April
    primary_contact_email TEXT,
    primary_contact_phone TEXT,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Estimation Rate Cards Table (PRD §10.3)
CREATE TABLE IF NOT EXISTS estimation_rate_cards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category        TEXT NOT NULL, -- e.g., 'travel', 'accommodation', 'software'
    item_name       TEXT NOT NULL,
    unit            TEXT, -- e.g., 'km', 'night', 'license'
    rate            DECIMAL DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. User Notification Preferences (PRD §11.3)
CREATE TABLE IF NOT EXISTS user_notification_prefs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    category        TEXT NOT NULL, -- e.g., 'allocation', 'expiry', 'system'
    email_enabled   BOOLEAN DEFAULT TRUE,
    in_app_enabled  BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, category)
);

-- 4. Data Integrity: Project Scope Unique Constraint (M-13)
-- Ensure updated_at exists for cleanup logic
ALTER TABLE project_scope ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- First, clean up duplicates if any exist (keep the latest updated one)
DELETE FROM project_scope a
USING project_scope b
WHERE a.project_id = b.project_id 
  AND a.updated_at < b.updated_at;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE table_name='project_scope' AND constraint_type='UNIQUE' AND constraint_name='project_scope_project_id_key') THEN
        ALTER TABLE project_scope ADD CONSTRAINT project_scope_project_id_key UNIQUE (project_id);
    END IF;
END $$;

-- 5. Data Integrity: activity_logs Foreign Key (M-7)
ALTER TABLE activity_logs ADD CONSTRAINT fk_activity_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- 6. Enhancement: allocation_conflicts override info (H-17)
ALTER TABLE allocation_conflicts ADD COLUMN IF NOT EXISTS override_reason TEXT;
ALTER TABLE allocation_conflicts ADD COLUMN IF NOT EXISTS overridden_by UUID REFERENCES users(id);
ALTER TABLE allocation_conflicts ADD COLUMN IF NOT EXISTS overridden_at TIMESTAMP;

-- 7. Enhancement: project_documents metadata (H-18)
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS description TEXT;

-- 8. Enhancement: allocations primary/secondary flag (H-15)
ALTER TABLE allocations ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT TRUE;

-- 9. Enhancement: soft-delete columns for more tables (M-15)
ALTER TABLE users  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE drones ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- 10. Add missing updated_at triggers
CREATE TRIGGER update_company_config_updated_at BEFORE UPDATE ON company_config FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_estimation_rate_cards_updated_at BEFORE UPDATE ON estimation_rate_cards FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 10. Seed default company config if table empty
INSERT INTO company_config (company_name) 
SELECT 'Varuna Nexus' WHERE NOT EXISTS (SELECT 1 FROM company_config);
