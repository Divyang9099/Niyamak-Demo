-- =============================================================
-- Migration: 006_finalize_pilots_schema
-- Description: Adds missing columns to pilots table to match PRD and code requirements
-- =============================================================

ALTER TABLE pilots ADD COLUMN IF NOT EXISTS license_expiry DATE;
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS employee_id TEXT UNIQUE;
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS per_day_rate DECIMAL;
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS certifications JSONB;
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Fix the trigger if missing
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_pilots_updated_at') THEN
        CREATE TRIGGER update_pilots_updated_at BEFORE UPDATE ON pilots FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;
