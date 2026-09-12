-- =============================================================
-- VARUNA OPS — DRONEOPS PLATFORM
-- Migration: 001_initial_schema
-- Database: PostgreSQL (Supabase compatible)
-- Run this in: Supabase SQL Editor → Run All
-- =============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';


-- ─────────────────────────────────────────────
-- 1. USERS & ROLES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            TEXT CHECK (role IN ('admin', 'project_manager', 'pilot')) NOT NULL,
    phone           TEXT,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret  TEXT,
    two_factor_backup_codes TEXT[],
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 2. PROJECTS (CORE TABLE)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    client_name         TEXT NOT NULL,
    project_type        TEXT NOT NULL,
    status              TEXT CHECK (
                            status IN (
                                'enquiry', 'confirmed', 'in_progress',
                                'post_processing', 'delivered', 'on_hold', 'cancelled'
                            )
                        ) DEFAULT 'enquiry',

    start_date          DATE,
    end_date            DATE,

    state               TEXT,
    district            TEXT,
    latitude            DECIMAL,
    longitude           DECIMAL,
    kml_file_url        TEXT,

    description         TEXT,
    po_number           TEXT,
    work_order_number   TEXT,
    contact_person      TEXT,

    created_by          UUID REFERENCES users(id),
    source_pipeline_id  UUID,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 2.1 PROJECT MAPS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_maps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    geojson_data    JSONB,
    center_lat      DECIMAL,
    center_lng      DECIMAL,
    zoom_level      DECIMAL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ─────────────────────────────────────────────
-- 3. PROJECT SCOPE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_scope (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              UUID REFERENCES projects(id) ON DELETE CASCADE,

    scope_type              TEXT,
    area_hectares           DECIMAL,
    length_km               DECIMAL,
    asset_count             INT,

    deliverables_expected   JSONB,
    special_instructions    TEXT,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_project_scope_updated_at BEFORE UPDATE ON project_scope FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 4. PILOTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pilots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    employee_id     TEXT UNIQUE,
    license_number  TEXT,
    license_expiry  DATE,
    base_location   TEXT,
    per_day_rate    DECIMAL,
    certifications  JSONB, -- Structured RPAS type rating + cleared models
    status          TEXT CHECK (status IN ('active', 'inactive', 'on_leave')) DEFAULT 'active',
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_pilots_updated_at BEFORE UPDATE ON pilots FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 5. DRONES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drones (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT,
    make                TEXT,
    model               TEXT,
    serial_number       TEXT,
    sensor_payloads     TEXT[], -- RGB, Thermal, LiDAR, Multispectral, etc.
    uin                 TEXT,
    day_rate            DECIMAL,
    insurance_expiry    DATE,
    last_maintenance    DATE,
    next_maintenance    DATE,
    status              TEXT CHECK (status IN ('active', 'maintenance', 'retired')) DEFAULT 'active',
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_drones_updated_at BEFORE UPDATE ON drones FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 6. PROJECT RESOURCE ALLOCATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS allocations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
    pilot_id    UUID REFERENCES pilots(id),
    drone_id    UUID REFERENCES drones(id),
    start_date  DATE,
    end_date    DATE,
    is_pipeline BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_allocations_updated_at BEFORE UPDATE ON allocations FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 7. PROJECT DOCUMENTS (WITH VERSIONING)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
    category    TEXT,
    file_name   TEXT,
    file_key    TEXT,
    version     TEXT,
    uploaded_by UUID REFERENCES users(id),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ─────────────────────────────────────────────
-- 8. DELIVERABLES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliverables (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,

    name        TEXT,
    format      TEXT,
    status      TEXT CHECK (status IN ('pending', 'uploaded', 'approved')) DEFAULT 'pending',

    file_key    TEXT,
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_deliverables_updated_at BEFORE UPDATE ON deliverables FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 9. PIPELINE (PRE-SALES)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name                    TEXT,
    client_name             TEXT,
    project_type            TEXT,

    stage                   TEXT CHECK (
                                stage IN (
                                    'enquiry', 'proposal', 'negotiation',
                                    'verbal_confirmation', 'lost', 'converted'
                                )
                            ),

    estimated_value         DECIMAL,
    win_probability         INT,

    state                   TEXT,
    latitude                DECIMAL,
    longitude               DECIMAL,

    tentative_scope         TEXT,
    notes                   TEXT,

    tentative_pilot         UUID REFERENCES pilots(id),
    tentative_drone         UUID REFERENCES drones(id),

    estimated_start         DATE,
    estimated_end           DATE,

    converted_project_id    UUID REFERENCES projects(id),

    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_pipeline_updated_at BEFORE UPDATE ON pipeline FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Add foreign key for projects -> pipeline (resolves forward reference)
ALTER TABLE projects ADD CONSTRAINT fk_projects_pipeline FOREIGN KEY (source_pipeline_id) REFERENCES pipeline(id);


-- ─────────────────────────────────────────────
-- 10. RESOURCE CALENDAR EVENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title           TEXT,
    event_type      TEXT CHECK (
                        event_type IN (
                            'project', 'pipeline', 'expo',
                            'training', 'maintenance', 'leave'
                        )
                    ),

    resource_type   TEXT CHECK (resource_type IN ('pilot', 'drone', 'all')),
    resource_id     UUID,

    start_date      DATE,
    end_date        DATE,

    location        TEXT,
    notes           TEXT,

    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 11. CONFLICT MANAGEMENT
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS allocation_conflicts (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allocation_id               UUID,
    conflicting_allocation_id   UUID,
    conflict_type               TEXT,
    resolved                    BOOLEAN DEFAULT FALSE,
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ─────────────────────────────────────────────
-- 12. ESTIMATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id      UUID REFERENCES projects(id),
    pipeline_id     UUID REFERENCES pipeline(id) ON DELETE SET NULL,
    client_name     TEXT,
    project_type    TEXT,

    total_cost      DECIMAL,
    margin          DECIMAL,
    tax             DECIMAL,

    details         JSONB,

    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_estimations_updated_at BEFORE UPDATE ON estimations FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 13. ESTIMATION ITEMS (BREAKDOWN)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimation_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimation_id   UUID REFERENCES estimations(id) ON DELETE CASCADE,

    category        TEXT,
    description     TEXT,
    quantity        DECIMAL,
    unit_cost       DECIMAL,
    total_cost      DECIMAL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_estimation_items_updated_at BEFORE UPDATE ON estimation_items FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 14. LIBRARY CATEGORIES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_categories (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name    TEXT NOT NULL
);


-- ─────────────────────────────────────────────
-- 15. LIBRARY DOCUMENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID REFERENCES library_categories(id),
    name            TEXT,
    description     TEXT,
    file_name       TEXT,
    file_key        TEXT,
    version         TEXT,
    uploaded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ─────────────────────────────────────────────
-- 16. LIBRARY VERSION HISTORY
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID REFERENCES library_documents(id) ON DELETE CASCADE,
    file_key        TEXT,
    version         TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ─────────────────────────────────────────────
-- 17. PROJECT MEMBERS (RBAC EXTENSION)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT CHECK (role IN ('project_manager', 'pilot', 'admin')),
    UNIQUE(project_id, user_id)
);


-- ─────────────────────────────────────────────
-- 18. NOTIFICATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT,
    message     TEXT,
    is_read     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 19. ACTIVITY LOGS (AUDIT)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID,
    action      TEXT,
    entity_type TEXT,
    entity_id   UUID,
    old_value   JSONB,
    new_value   JSONB,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ─────────────────────────────────────────────
-- 20. PERFORMANCE INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_status      ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_type        ON projects(project_type);
CREATE INDEX IF NOT EXISTS idx_allocations_dates    ON allocations(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_pipeline_stage       ON pipeline(stage);
CREATE INDEX IF NOT EXISTS idx_calendar_dates       ON calendar_events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_deliverables_status  ON deliverables(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_activity_entity      ON activity_logs(entity_type, entity_id);


-- ─────────────────────────────────────────────
-- 21. PASSWORD RESET TOKENS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMP NOT NULL,
    used        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_tokens(token);


-- ─────────────────────────────────────────────
-- 22. DRONE MAINTENANCE LOGS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drone_maintenance_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drone_id        UUID REFERENCES drones(id) ON DELETE CASCADE,
    maintenance_type TEXT,
    description     TEXT,
    performed_by    TEXT,
    performed_at    DATE,
    next_due        DATE,
    cost            DECIMAL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_maintenance_drone ON drone_maintenance_logs(drone_id);


-- =============================================================
-- END OF MIGRATION 001
-- =============================================================

