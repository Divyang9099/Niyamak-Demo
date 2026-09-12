-- 059_extend_session_window.sql
-- "Stay signed in" — extend the session window from 8 hours to 15 days.
--
-- Migration 020 added session_timeout_hours with a 168-hour (7-day) ceiling and
-- an 8-hour default, which is what forced users to log in again every day.
-- Raise the ceiling to 8760 hours (1 year) so the admin setting can express
-- longer windows, and move the default to 360 hours = 15 days.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_config' AND column_name = 'session_timeout_hours'
  ) THEN
    -- Replace the 168-hour CHECK with a 1-year ceiling
    ALTER TABLE company_config
      DROP CONSTRAINT IF EXISTS company_config_session_timeout_hours_check;
    ALTER TABLE company_config
      ADD CONSTRAINT company_config_session_timeout_hours_check
      CHECK (session_timeout_hours >= 1 AND session_timeout_hours <= 8760);

    ALTER TABLE company_config
      ALTER COLUMN session_timeout_hours SET DEFAULT 360;

    -- Only move rows still sitting on the old default; a deliberate admin
    -- choice (anything other than 8) is left untouched.
    UPDATE company_config SET session_timeout_hours = 360
     WHERE session_timeout_hours = 8;
  END IF;
END $$;
