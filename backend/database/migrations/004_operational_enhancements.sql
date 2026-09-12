-- =============================================================
-- Migration: 003_operational_enhancements
-- Description: Adds missing fields for detailed project tracking
-- =============================================================

-- 1. Add location_name to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS location_name TEXT;

-- 2. Add deliverable_metadata to project_scope (alternative to deliverables_expected)
ALTER TABLE project_scope ADD COLUMN IF NOT EXISTS deliverable_metadata JSONB;

-- 3. Add pilot_id and drone_id directly to projects for quick reference (optional but helpful)
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS pilot_id UUID;
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS drone_id UUID;

-- 4. Ensure status constraint is complete
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (
    status IN (
        'enquiry', 'confirmed', 'in_progress', 
        'post_processing', 'delivered', 'on_hold', 'cancelled'
    )
);

-- 5. Add area_type and project_category to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_category TEXT;
