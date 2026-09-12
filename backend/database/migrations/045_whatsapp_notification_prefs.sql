-- Migration 045: Add whatsapp_enabled to user_notification_prefs
-- Mirrors the existing email_enabled column so users can toggle
-- WhatsApp notifications per category independently of email.

ALTER TABLE user_notification_prefs
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT TRUE;
