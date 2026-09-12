-- ============================================================================
-- 037_post_processing_stage.sql
--
-- Inserts a Post Processing stage between Executed and Complete.
-- New lifecycle: initiate → planned → on_going → executed → post_processing → complete
-- ============================================================================

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('initiate','planned','on_going','executed','post_processing','complete','cancelled'));
