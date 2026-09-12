-- Migration 008: Add created_by to pipeline table
ALTER TABLE pipeline
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
