-- Migration 007: Account lockout columns for brute-force protection
-- Adds failed_login_attempts counter and locked_until timestamp to users table.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMPTZ;
