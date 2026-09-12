-- Migration 020: Configurable session idle timeout
-- PRD §9.3 — admin-tunable session expiry (default 8 hours)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_config' AND column_name = 'session_timeout_hours'
  ) THEN
    ALTER TABLE company_config
      ADD COLUMN session_timeout_hours INTEGER NOT NULL DEFAULT 8
      CHECK (session_timeout_hours >= 1 AND session_timeout_hours <= 168);
  END IF;
END $$;
