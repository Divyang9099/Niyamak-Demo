-- =============================================================
-- Migration: 055_pilot_tracking
-- Description: Creates tables for Pilot Attendance, Leave Balances,
--              Company Holidays, Salary & Bonus Settings, and
--              Monthly Payroll Calculation Records.
-- =============================================================

-- 1. Pilot Attendance
CREATE TABLE IF NOT EXISTS pilot_attendance (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pilot_id    UUID REFERENCES pilots(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('present', 'on_field', 'on_leave', 'absent', 'half_day', 'holiday', 'off')) DEFAULT 'present',
    check_in    TIME,
    check_out   TIME,
    notes       TEXT,
    site_location TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pilot_attendance_unique_pilot_date UNIQUE (pilot_id, date)
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_pilot_attendance_updated_at') THEN
        CREATE TRIGGER update_pilot_attendance_updated_at BEFORE UPDATE ON pilot_attendance FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

-- 2. Pilot Leave Balances
CREATE TABLE IF NOT EXISTS pilot_leave_balances (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pilot_id              UUID REFERENCES pilots(id) ON DELETE CASCADE,
    year                  INT NOT NULL,
    total_allowed_leaves  DECIMAL DEFAULT 18,
    casual_leave          DECIMAL DEFAULT 6,
    sick_leave            DECIMAL DEFAULT 6,
    earned_leave          DECIMAL DEFAULT 6,
    leaves_taken          DECIMAL DEFAULT 0,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pilot_leave_balances_unique UNIQUE (pilot_id, year)
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_pilot_leave_balances_updated_at') THEN
        CREATE TRIGGER update_pilot_leave_balances_updated_at BEFORE UPDATE ON pilot_leave_balances FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

-- 3. Company Holidays
CREATE TABLE IF NOT EXISTS company_holidays (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date        DATE NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    year        INT NOT NULL,
    is_optional BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Pilot Payroll & Bonus Settings (Admin settings per pilot)
CREATE TABLE IF NOT EXISTS pilot_payroll_settings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pilot_id                    UUID REFERENCES pilots(id) ON DELETE CASCADE UNIQUE,
    base_monthly_salary         DECIMAL DEFAULT 0,
    field_per_diem_bonus        DECIMAL DEFAULT 0,
    unapproved_absent_deduction DECIMAL DEFAULT 0,
    per_flight_bonus            DECIMAL DEFAULT 0,
    custom_bonus_default        DECIMAL DEFAULT 0,
    custom_deduction_default    DECIMAL DEFAULT 0,
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_pilot_payroll_settings_updated_at') THEN
        CREATE TRIGGER update_pilot_payroll_settings_updated_at BEFORE UPDATE ON pilot_payroll_settings FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

-- 5. Pilot Payroll Records (Monthly Calculated Payroll Snapshots)
CREATE TABLE IF NOT EXISTS pilot_payroll_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pilot_id                UUID REFERENCES pilots(id) ON DELETE CASCADE,
    month                   INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year                    INT NOT NULL,
    working_days            INT NOT NULL DEFAULT 30,
    days_present            DECIMAL DEFAULT 0,
    days_on_field           DECIMAL DEFAULT 0,
    days_leave              DECIMAL DEFAULT 0,
    days_absent             DECIMAL DEFAULT 0,
    days_half               DECIMAL DEFAULT 0,
    base_salary             DECIMAL NOT NULL DEFAULT 0,
    field_bonus_total       DECIMAL NOT NULL DEFAULT 0,
    custom_bonus            DECIMAL NOT NULL DEFAULT 0,
    bonus_notes             TEXT,
    unpaid_absent_cut       DECIMAL NOT NULL DEFAULT 0,
    custom_deduction        DECIMAL NOT NULL DEFAULT 0,
    deduction_notes         TEXT,
    net_salary              DECIMAL NOT NULL DEFAULT 0,
    status                  TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processed', 'paid')),
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pilot_payroll_records_unique UNIQUE (pilot_id, month, year)
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_pilot_payroll_records_updated_at') THEN
        CREATE TRIGGER update_pilot_payroll_records_updated_at BEFORE UPDATE ON pilot_payroll_records FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_pilot_attendance_pilot_date ON pilot_attendance(pilot_id, date);
CREATE INDEX IF NOT EXISTS idx_pilot_attendance_date ON pilot_attendance(date);
CREATE INDEX IF NOT EXISTS idx_company_holidays_year ON company_holidays(year);
CREATE INDEX IF NOT EXISTS idx_pilot_payroll_records_month_year ON pilot_payroll_records(month, year);

-- 6. Additional pilot details for tracking
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS joining_date DATE;
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'full_time';
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS designation TEXT DEFAULT 'Drone Pilot';
ALTER TABLE pilot_attendance ADD COLUMN IF NOT EXISTS site_location TEXT;

