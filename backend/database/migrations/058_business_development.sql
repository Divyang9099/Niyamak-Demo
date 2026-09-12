-- Migration 058: Business Development (BD) module
--
-- Self-contained lead-generation module. Deliberately independent of the
-- existing `clients` / `projects` / `pipeline` / `project_type_configs` /
-- `activity_logs` tables — see BD_MODULE_PLAN.md §0 for the rationale.
-- The ONLY foreign key leaving this module is users(id), used purely for
-- identity (who owns / logged / created a record). Every table is prefixed
-- bd_ so the whole module can be dropped without touching anything else.

-- ─────────────────────────────────────────────
-- 1. bd_sectors — dashboard sections (independent copy of sector names)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_sectors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL,
    icon        TEXT,                       -- Material Symbols name
    color_token TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bd_sectors_active ON bd_sectors(is_active) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS update_bd_sectors_updated_at ON bd_sectors;
CREATE TRIGGER update_bd_sectors_updated_at BEFORE UPDATE ON bd_sectors
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

INSERT INTO bd_sectors (key, label, icon, sort_order) VALUES
    ('solar',      'Solar',      'solar_power',   10),
    ('windmill',   'Windmill',   'wind_power',    20),
    ('td_lines',   'T&L',        'electric_bolt', 30),
    ('chimney',    'Chimney',    'factory',       40),
    ('tower',      'Tower',      'cell_tower',    50),
    ('pipeline',   'Pipeline',   'water',         60),
    ('volumetric', 'Volumetric', 'view_in_ar',    70),
    ('other',      'Other',      'category',      80)
ON CONFLICT (key) DO NOTHING;


-- ─────────────────────────────────────────────
-- 2. bd_departments — the "person involved" department dropdown
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_departments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bd_departments_active ON bd_departments(is_active) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS update_bd_departments_updated_at ON bd_departments;
CREATE TRIGGER update_bd_departments_updated_at BEFORE UPDATE ON bd_departments
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

INSERT INTO bd_departments (key, label, sort_order) VALUES
    ('procurement',   'Procurement',           10),
    ('projects',      'Projects',              20),
    ('om',            'O&M / Maintenance',     30),
    ('engineering',   'Engineering & Design',  40),
    ('finance',       'Finance',               50),
    ('management',    'Management / CXO',      60),
    ('quality',       'Quality & Safety',      70),
    ('bd',            'Business Development',  80),
    ('other',         'Other',                 90)
ON CONFLICT (key) DO NOTHING;


-- ─────────────────────────────────────────────
-- 3. bd_clients — the prospect master (independent of `clients`)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_clients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    details             TEXT,
    logo_url            TEXT,                       -- R2 object key
    bd_owner_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    priority            TEXT NOT NULL DEFAULT 'C' CHECK (priority IN ('A', 'B', 'C')),
    sectors             TEXT[] NOT NULL DEFAULT '{}',
    status              TEXT NOT NULL DEFAULT 'to_be_initiated'
                          CHECK (status IN ('to_be_initiated', 'wip', 'closed_onboard', 'closed_cancelled')),
    status_changed_at   TIMESTAMPTZ,
    status_reason       TEXT,
    website             TEXT,
    city                TEXT,
    state               TEXT,
    address             TEXT,
    notes               TEXT,
    -- Rollups — maintained by the service layer, not triggers, so a single
    -- transaction can update the touchpoint + channel + client rollup atomically.
    next_follow_up_at   TIMESTAMPTZ,
    last_activity_at    TIMESTAMPTZ,
    contact_count       INTEGER NOT NULL DEFAULT 0,
    touchpoint_count    INTEGER NOT NULL DEFAULT 0,
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

-- Case-insensitive, whitespace-trimmed uniqueness among live rows only —
-- mirrors the existing `clients` table's uq_clients_name_ci pattern.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bd_clients_name_ci
    ON bd_clients (LOWER(TRIM(name))) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bd_clients_status        ON bd_clients(status)       WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bd_clients_priority      ON bd_clients(priority)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bd_clients_owner         ON bd_clients(bd_owner_id)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bd_clients_sectors_gin   ON bd_clients USING GIN (sectors);
CREATE INDEX IF NOT EXISTS idx_bd_clients_next_followup ON bd_clients(next_follow_up_at) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_bd_clients_updated_at ON bd_clients;
CREATE TRIGGER update_bd_clients_updated_at BEFORE UPDATE ON bd_clients
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 4. bd_contacts — "person involved"
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_contacts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL REFERENCES bd_clients(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    designation         TEXT,
    department          TEXT,                       -- key from bd_departments
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    is_decision_maker   BOOLEAN NOT NULL DEFAULT FALSE,
    notes               TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

-- One primary contact per client among live rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bd_contacts_primary_per_client
    ON bd_contacts (client_id) WHERE is_primary = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bd_contacts_client ON bd_contacts(client_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_bd_contacts_updated_at ON bd_contacts;
CREATE TRIGGER update_bd_contacts_updated_at BEFORE UPDATE ON bd_contacts
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 5. bd_channels — every contactable endpoint (polymorphic: client or contact)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_channels (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL REFERENCES bd_clients(id) ON DELETE CASCADE,
    owner_type          TEXT NOT NULL CHECK (owner_type IN ('client', 'contact')),
    contact_id          UUID REFERENCES bd_contacts(id) ON DELETE CASCADE,
    channel_type        TEXT NOT NULL CHECK (channel_type IN ('email', 'phone', 'linkedin', 'whatsapp')),
    value               TEXT NOT NULL,
    label               TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    -- Rollups — recomputed by bd.touchpoints.service on every log/response.
    outreach_count      INTEGER NOT NULL DEFAULT 0,
    last_outreach_at    TIMESTAMPTZ,
    last_response_at    TIMESTAMPTZ,
    channel_status      TEXT NOT NULL DEFAULT 'not_contacted'
                          CHECK (channel_status IN ('not_contacted', 'contacted', 'awaiting_response', 'responded', 'bounced', 'unreachable')),
    last_remark         TEXT,
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    -- Keeps the polymorphism honest: contact_id set iff owner_type='contact'.
    CONSTRAINT chk_bd_channels_owner_shape CHECK (
        (owner_type = 'contact' AND contact_id IS NOT NULL) OR
        (owner_type = 'client'  AND contact_id IS NULL)
    )
);

-- No duplicate address on the same client (case-insensitive) among live rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bd_channels_client_type_value
    ON bd_channels (client_id, channel_type, LOWER(value)) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bd_channels_client        ON bd_channels(client_id, channel_type, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bd_channels_contact        ON bd_channels(contact_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bd_channels_status          ON bd_channels(channel_status) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_bd_channels_updated_at ON bd_channels;
CREATE TRIGGER update_bd_channels_updated_at BEFORE UPDATE ON bd_channels
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 6. bd_touchpoints — append-only interaction log (never deleted)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_touchpoints (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL REFERENCES bd_clients(id) ON DELETE CASCADE,
    contact_id          UUID REFERENCES bd_contacts(id) ON DELETE SET NULL,
    channel_id          UUID REFERENCES bd_channels(id) ON DELETE SET NULL,
    interaction_type    TEXT NOT NULL CHECK (interaction_type IN ('email', 'call', 'linkedin', 'whatsapp', 'meeting', 'site_visit', 'other')),
    direction           TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    subject             TEXT,
    summary             TEXT,
    response_status     TEXT NOT NULL DEFAULT 'awaiting'
                          CHECK (response_status IN ('awaiting', 'positive', 'negative', 'neutral', 'no_response', 'bounced')),
    response_at         TIMESTAMPTZ,
    response_summary    TEXT,
    remark               TEXT,
    outcome             TEXT,
    next_follow_up_at   TIMESTAMPTZ,
    attachment_keys     TEXT[] NOT NULL DEFAULT '{}',
    is_corrected        BOOLEAN NOT NULL DEFAULT FALSE,
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- No deleted_at by design — touchpoints are append-only; corrections are
    -- edits (is_corrected=true) logged in bd_activity_log, never deletions.
);

CREATE INDEX IF NOT EXISTS idx_bd_touchpoints_client   ON bd_touchpoints(client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_bd_touchpoints_channel  ON bd_touchpoints(channel_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_bd_touchpoints_response ON bd_touchpoints(response_status);
CREATE INDEX IF NOT EXISTS idx_bd_touchpoints_creator  ON bd_touchpoints(created_by);

DROP TRIGGER IF EXISTS update_bd_touchpoints_updated_at ON bd_touchpoints;
CREATE TRIGGER update_bd_touchpoints_updated_at BEFORE UPDATE ON bd_touchpoints
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 7. bd_followups — scheduled reminders
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_followups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL REFERENCES bd_clients(id) ON DELETE CASCADE,
    touchpoint_id       UUID REFERENCES bd_touchpoints(id) ON DELETE CASCADE,
    contact_id          UUID REFERENCES bd_contacts(id) ON DELETE SET NULL,
    channel_id          UUID REFERENCES bd_channels(id) ON DELETE SET NULL,
    due_at              TIMESTAMPTZ NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'sent', 'completed', 'cancelled', 'escalated')),
    assigned_to         UUID REFERENCES users(id) ON DELETE SET NULL,
    reminder_count      INTEGER NOT NULL DEFAULT 0,
    last_reminded_at    TIMESTAMPTZ,
    note                TEXT,
    completed_at        TIMESTAMPTZ,
    completed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The cron sweep's only hot query: pending/sent follow-ups due now.
CREATE INDEX IF NOT EXISTS idx_bd_followups_due
    ON bd_followups(status, due_at) WHERE status IN ('pending', 'sent');
CREATE INDEX IF NOT EXISTS idx_bd_followups_client ON bd_followups(client_id);
CREATE INDEX IF NOT EXISTS idx_bd_followups_assignee ON bd_followups(assigned_to) WHERE status IN ('pending', 'sent');

DROP TRIGGER IF EXISTS update_bd_followups_updated_at ON bd_followups;
CREATE TRIGGER update_bd_followups_updated_at BEFORE UPDATE ON bd_followups
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────
-- 8. bd_activity_log — BD's own audit trail (independent of activity_logs)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_activity_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'contact', 'channel', 'touchpoint', 'followup', 'settings')),
    entity_id   UUID,
    client_id   UUID REFERENCES bd_clients(id) ON DELETE CASCADE,
    old_value   JSONB,
    new_value   JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- Append-only — no updated_at, no deleted_at.
);

CREATE INDEX IF NOT EXISTS idx_bd_activity_client ON bd_activity_log(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bd_activity_entity  ON bd_activity_log(entity_type, entity_id);


-- ─────────────────────────────────────────────
-- 9. bd_settings — single-row module configuration
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_settings (
    id                          BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE), -- enforces a single row
    default_followup_days       INTEGER NOT NULL DEFAULT 3,
    priority_a_followup_days    INTEGER NOT NULL DEFAULT 2,
    escalation_days             INTEGER NOT NULL DEFAULT 7,
    max_reminders                INTEGER NOT NULL DEFAULT 3,
    reminder_hour_ist            INTEGER NOT NULL DEFAULT 9 CHECK (reminder_hour_ist BETWEEN 0 AND 23),
    digest_enabled                BOOLEAN NOT NULL DEFAULT TRUE,
    notify_user_ids               UUID[] NOT NULL DEFAULT '{}',
    weekly_summary_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_bd_settings_updated_at ON bd_settings;
CREATE TRIGGER update_bd_settings_updated_at BEFORE UPDATE ON bd_settings
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

INSERT INTO bd_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
