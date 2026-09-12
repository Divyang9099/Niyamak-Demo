-- Migration 035: index notifications for the per-user feed query.
-- getNotifications runs `WHERE user_id = $1 ORDER BY created_at DESC`. Without a
-- matching index this degrades to a seq-scan + sort as the table grows, holding a
-- pool connection longer under load. This index makes it an instant index scan.

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);
