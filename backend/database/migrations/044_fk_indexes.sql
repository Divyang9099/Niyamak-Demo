-- 044 — Foreign-key covering indexes
-- Postgres does NOT auto-create indexes on the child side of a foreign key.
-- Without them, every parent-row delete and every join across the FK does a
-- sequential scan on the child table. Invisible at small scale; expensive past
-- a few thousand rows. This migration adds the missing FK indexes flagged by the
-- schema audit. All are IF NOT EXISTS so the migration is idempotent.

-- activity / audit
CREATE INDEX IF NOT EXISTS idx_activity_logs_user            ON activity_logs(user_id);

-- allocation conflicts
CREATE INDEX IF NOT EXISTS idx_alloc_conflicts_alloc         ON allocation_conflicts(allocation_id);
CREATE INDEX IF NOT EXISTS idx_alloc_conflicts_conflicting   ON allocation_conflicts(conflicting_allocation_id);
CREATE INDEX IF NOT EXISTS idx_alloc_conflicts_overridden_by ON allocation_conflicts(overridden_by);

-- allocations
CREATE INDEX IF NOT EXISTS idx_allocations_project           ON allocations(project_id);

-- assets
CREATE INDEX IF NOT EXISTS idx_assets_created_by             ON assets(created_by);

-- deliverables + versions
CREATE INDEX IF NOT EXISTS idx_deliverables_upload_session   ON deliverables(upload_session_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_approved_by      ON deliverables(approved_by);
CREATE INDEX IF NOT EXISTS idx_deliverables_rejected_by      ON deliverables(rejected_by);
CREATE INDEX IF NOT EXISTS idx_deliverables_uploaded_by      ON deliverables(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_deliverable_versions_uploaded_by ON deliverable_versions(uploaded_by);

-- estimations
CREATE INDEX IF NOT EXISTS idx_estimation_items_estimation   ON estimation_items(estimation_id);
CREATE INDEX IF NOT EXISTS idx_estimations_created_by        ON estimations(created_by);

-- library
CREATE INDEX IF NOT EXISTS idx_library_docs_uploaded_by      ON library_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_library_docs_archived_by      ON library_documents(archived_by);
CREATE INDEX IF NOT EXISTS idx_library_docs_folder           ON library_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_library_file_tags_tag         ON library_file_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_library_folders_parent        ON library_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_library_versions_document     ON library_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_library_versions_uploaded_by  ON library_versions(uploaded_by);

-- password reset
CREATE INDEX IF NOT EXISTS idx_password_reset_user           ON password_reset_tokens(user_id);

-- pipeline
CREATE INDEX IF NOT EXISTS idx_pipeline_tentative_drone      ON pipeline(tentative_drone);
CREATE INDEX IF NOT EXISTS idx_pipeline_tentative_pilot      ON pipeline(tentative_pilot);
CREATE INDEX IF NOT EXISTS idx_pipeline_converted_project    ON pipeline(converted_project_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_created_by           ON pipeline(created_by);
CREATE INDEX IF NOT EXISTS idx_pipeline_docs_uploaded_by     ON pipeline_documents(uploaded_by);

-- project documents
CREATE INDEX IF NOT EXISTS idx_project_documents_project     ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_uploaded_by ON project_documents(uploaded_by);

-- project drones / expenses / invoices / kml
CREATE INDEX IF NOT EXISTS idx_project_drones_added_by       ON project_drones(added_by);
CREATE INDEX IF NOT EXISTS idx_project_expenses_added_by     ON project_expenses(added_by);
CREATE INDEX IF NOT EXISTS idx_project_invoices_created_by   ON project_invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_project_kml_uploaded_by       ON project_kml_uploads(uploaded_by);

-- projects
CREATE INDEX IF NOT EXISTS idx_projects_archived_by          ON projects(archived_by);
CREATE INDEX IF NOT EXISTS idx_projects_source_pipeline      ON projects(source_pipeline_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by           ON projects(created_by);
