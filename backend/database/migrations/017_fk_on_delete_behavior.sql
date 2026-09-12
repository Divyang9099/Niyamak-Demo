-- Migration: 017_fk_on_delete_behavior
-- Description: Set ON DELETE behavior for FKs that previously blocked user removal.
--   * uploaded_by columns → SET NULL (preserve audit trail of historical uploads)
--   * notifications.user_id → CASCADE (notifications are user-scoped, no value after deletion)

ALTER TABLE deliverables
  DROP CONSTRAINT IF EXISTS deliverables_uploaded_by_fkey,
  ADD CONSTRAINT deliverables_uploaded_by_fkey
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE project_documents
  DROP CONSTRAINT IF EXISTS project_documents_uploaded_by_fkey,
  ADD CONSTRAINT project_documents_uploaded_by_fkey
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey,
  ADD CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
