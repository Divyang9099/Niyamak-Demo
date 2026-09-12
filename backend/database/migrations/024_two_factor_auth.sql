-- Migration 024: Two-Factor Authentication (TOTP) — PRD §9.3
-- Stores TOTP secret per user, enabled flag, and a count of recent failures.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='users' AND column_name='two_factor_secret') THEN
    ALTER TABLE users ADD COLUMN two_factor_secret TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='users' AND column_name='two_factor_enabled') THEN
    ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='users' AND column_name='two_factor_enabled_at') THEN
    ALTER TABLE users ADD COLUMN two_factor_enabled_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_2fa_enabled
  ON users(two_factor_enabled) WHERE two_factor_enabled = TRUE;
