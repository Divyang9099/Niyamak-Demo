-- Migration: 063_add_projects_project_value
-- Purpose: `projects.project_value` is read/written throughout the codebase
--          (project.service create+update, dashboard.service summary,
--          report.data weekly report, client.service project list,
--          conversion.service pipeline→project) but was never created by any
--          migration — it exists in the live database only because it was added
--          by hand. A database built purely from migrations therefore 500s on
--          the dashboard and cannot create a project.
--
-- This records the existing production column so a freshly migrated database
-- matches the schema the application expects.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS makes this a no-op where the column
-- already exists (i.e. production), so it changes nothing there.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_value NUMERIC;

COMMENT ON COLUMN projects.project_value IS
  'Contract value of the project in INR. Carried over from the pipeline lead''s estimated_value on conversion.';
