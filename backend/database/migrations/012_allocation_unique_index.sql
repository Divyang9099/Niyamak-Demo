-- Migration: 012_allocation_unique_index
-- Overlap-aware indexes on allocations to accelerate the double-booking checks in
-- allocation.service.js (which enforces conflicts at the APPLICATION level via
-- advisory locks plus an explicit force-override path).
--
-- NOTE: these were originally written as UNIQUE GIST indexes, which PostgreSQL
-- rejects ("access method gist does not support unique indexes") — so on a fresh
-- database every migration from here on never ran. A hard EXCLUDE constraint is
-- deliberately NOT used either, because the app intentionally permits forced /
-- overridden double-bookings; the DB must not block overlaps outright. These are
-- therefore plain (non-unique) GIST indexes that just speed up the overlap lookups.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE INDEX IF NOT EXISTS idx_allocations_pilot_daterange
  ON allocations
  USING GIST (pilot_id, daterange(start_date, end_date, '[)'))
  WHERE pilot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_allocations_drone_daterange
  ON allocations
  USING GIST (drone_id, daterange(start_date, end_date, '[)'))
  WHERE drone_id IS NOT NULL;

-- Ensure cascade delete on library_file_tags when a tag is removed (DI-07)
ALTER TABLE library_file_tags
  DROP CONSTRAINT IF EXISTS library_file_tags_tag_id_fkey;

ALTER TABLE library_file_tags
  ADD CONSTRAINT library_file_tags_tag_id_fkey
  FOREIGN KEY (tag_id) REFERENCES library_tags(id) ON DELETE CASCADE;
