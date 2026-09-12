-- Migration 034: User profile picture (avatar)
-- Adds avatar_url to users. Stores the Cloudflare R2 object KEY (not a public URL);
-- the image is streamed back through GET /api/v1/users/:id/avatar. NULL = no picture.
-- Feature is intended for project_manager and pilot users (admins are not required to
-- set one), but the column is role-agnostic at the DB layer.

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
