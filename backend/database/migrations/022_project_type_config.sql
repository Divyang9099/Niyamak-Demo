-- Migration 022: Project Type configuration (PRD §10.4)
-- Drives dropdown lists, default scope units, default deliverables, default estimation params.

CREATE TABLE IF NOT EXISTS project_type_configs (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key                       TEXT NOT NULL UNIQUE,             -- machine identifier (solar_pv, wind, ...)
    label                     TEXT NOT NULL,                    -- display name
    icon                      TEXT,                             -- material symbol name
    default_scope_unit        TEXT,                             -- MWp, km, per turbine, hectares, ...
    default_deliverables      TEXT[] DEFAULT '{}',              -- checklist
    default_estimation_params JSONB DEFAULT '{}'::JSONB,        -- per-type defaults the estimator can read
    sort_order                INTEGER DEFAULT 0,
    is_active                 BOOLEAN DEFAULT TRUE,
    created_at                TIMESTAMPTZ DEFAULT NOW(),
    updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_type_configs_active
    ON project_type_configs(is_active) WHERE is_active = TRUE;

-- Keep updated_at honest
DROP TRIGGER IF EXISTS update_project_type_configs_updated_at ON project_type_configs;
CREATE TRIGGER update_project_type_configs_updated_at
    BEFORE UPDATE ON project_type_configs
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Seed PRD types (idempotent)
INSERT INTO project_type_configs (key, label, icon, default_scope_unit, default_deliverables, sort_order) VALUES
    ('solar_pv',    'Solar PV',            'solar_power',         'MWp',           ARRAY['Orthomosaic','Thermal Report','Inspection Report PDF','Raw Images'], 10),
    ('wind',        'Wind Turbine',        'wind_power',          'Per turbine',   ARRAY['Inspection Report PDF','Raw Images','Processed Video'],              20),
    ('td_lines',    'T&D Lines',           'electric_bolt',       'Per km',        ARRAY['Inspection Report PDF','Orthomosaic','Raw Images'],                  30),
    ('tower',       'Tower Inspection',    'cell_tower',          'Per tower',     ARRAY['Inspection Report PDF','Raw Images','3D Model'],                     40),
    ('pipeline',    'Pipeline',            'water',               'Per km',        ARRAY['Orthomosaic','Inspection Report PDF','Raw Images'],                  50),
    ('volumetric',  'Volumetric',          'view_in_ar',          'Per hectare',   ARRAY['Volume Report','Point Cloud','3D Model','Orthomosaic'],              60),
    ('other',       'Other',               'category',            'Custom',        ARRAY['Inspection Report PDF'],                                              70)
ON CONFLICT (key) DO UPDATE SET
    label              = EXCLUDED.label,
    icon               = EXCLUDED.icon,
    default_scope_unit = EXCLUDED.default_scope_unit,
    sort_order         = EXCLUDED.sort_order;
