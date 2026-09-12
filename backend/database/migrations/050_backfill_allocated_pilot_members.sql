-- Migration: 050_backfill_allocated_pilot_members
-- Backfill project_members for pilots who are allocated to a project but were
-- never added as members.
--
-- Background: the normal allocation flow inserts the pilot's user into
-- project_members, but the pipeline→project conversion path created the
-- allocation directly and skipped that step. As a result a converted project's
-- allocated pilot showed on the Resources tab but not on the Members tab.
-- The conversion service now mirrors the membership; this migration fixes the
-- projects that were already converted.

INSERT INTO project_members (project_id, user_id, role)
SELECT DISTINCT a.project_id, pl.user_id, 'pilot'
FROM allocations a
JOIN pilots pl ON pl.id = a.pilot_id AND pl.deleted_at IS NULL
JOIN projects p ON p.id = a.project_id AND p.deleted_at IS NULL
WHERE a.pilot_id IS NOT NULL
  AND pl.user_id IS NOT NULL
ON CONFLICT DO NOTHING;
