-- 053_weekly_report_settings.sql
-- Singleton row that controls the automated weekly operations report email.
-- send_day: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
-- send_hour_ist: 0-23 in IST
CREATE TABLE IF NOT EXISTS weekly_report_settings (
  id              SERIAL PRIMARY KEY,
  enabled         BOOLEAN   NOT NULL DEFAULT FALSE,
  send_day        SMALLINT  NOT NULL DEFAULT 1,       -- Monday
  send_hour_ist   SMALLINT  NOT NULL DEFAULT 8,       -- 8 AM IST
  recipients      TEXT[]    NOT NULL DEFAULT '{}',    -- extra email addresses
  include_admins  BOOLEAN   NOT NULL DEFAULT TRUE,
  include_pms     BOOLEAN   NOT NULL DEFAULT TRUE,
  last_sent_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exactly one settings row ever exists
INSERT INTO weekly_report_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
