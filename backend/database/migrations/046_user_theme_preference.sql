-- Migration 046: Store theme preference per user
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'obsidian'
    CHECK (theme IN ('obsidian','light','midnight','forest','solar'));
