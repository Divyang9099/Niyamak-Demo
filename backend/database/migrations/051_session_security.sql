-- Migration 051: session security hardening
--
-- H-1: per-OTP attempt counter so a reset code can be retired after N wrong tries
--      (defence-in-depth alongside the new IP rate-limit on /reset-password).
-- H-4: tokens_valid_after — any JWT issued before this instant is rejected by the
--      auth middleware. Set on password reset / change / account deactivation so a
--      compromised or stale session is killed immediately instead of living the
--      full JWT lifetime (was up to 8h).

ALTER TABLE password_reset_tokens
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tokens_valid_after TIMESTAMPTZ;
