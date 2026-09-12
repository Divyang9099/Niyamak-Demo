const db     = require('../../core/config/db');
const socket = require('../../core/socket/socket.gateway');
const EVENTS = require('../../core/socket/socket.events');

// Derive a preference category from notification title/content
const _inferCategory = (title = '') => {
  const t = title.toLowerCase();
  if (t.includes('alloc'))                                           return 'allocation';
  if (t.includes('expir') || t.includes('license') || t.includes('maintenance')) return 'expiry';
  if (t.includes('status') || t.includes('project'))                return 'project_status';
  return 'system';
};

/**
 * Create a notification — called internally by other services.
 * Respects user_notification_prefs.in_app_enabled for the inferred category.
 * Emits socket event so the Topbar badge updates in real time.
 *
 * @param {number} [dedupeHours] - If set, skip insertion when an identical
 *   (user_id + title + message) unread-or-read notification already exists within
 *   this many hours. Use for recurring/cron notifications (expiry, maintenance,
 *   overdue) so backend restarts and repeated daily runs don't pile up duplicates.
 *   Event-driven notifications (allocation, approval) should omit this.
 */
exports.createNotification = async ({ user_id, title, message, category, dedupeHours, entity_type, entity_id }) => {
  const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [user_id]);
  if (!userCheck.rows.length) {
    console.warn(`[Notification] Skip: User ${user_id} does not exist.`);
    return null;
  }

  const cat = category || _inferCategory(title);

  // Check in-app preference (default allow if row missing)
  const prefRow = await db.query(
    'SELECT in_app_enabled FROM user_notification_prefs WHERE user_id=$1 AND category=$2',
    [user_id, cat]
  );
  if (prefRow.rows[0]?.in_app_enabled === false) return null;

  // Deduplication — skip if an identical notification was created recently
  if (dedupeHours && dedupeHours > 0) {
    const dup = await db.query(
      `SELECT id FROM notifications
        WHERE user_id = $1 AND title = $2 AND message = $3
          AND created_at > NOW() - ($4 || ' hours')::INTERVAL
        LIMIT 1`,
      [user_id, title, message, String(dedupeHours)]
    );
    if (dup.rows.length) return null; // already notified within window
  }

  const result = await db.query(
    `INSERT INTO notifications (user_id, title, message, entity_type, entity_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [user_id, title, message, entity_type || null, entity_id || null]
  );
  const notif = result.rows[0];

  // Real-time push to the recipient's private room
  socket.emitToUser(user_id, EVENTS.NOTIFICATION_NEW, notif);

  return notif;
};

/**
 * Get notifications for a specific user
 */
exports.getNotifications = async (userId) => {
  const result = await db.query(
    `SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
};

/**
 * Mark a single notification as read
 */
exports.markAsRead = async (id, userId) => {
  const result = await db.query(
    `UPDATE notifications
     SET is_read = true
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [id, userId]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('Notification not found'), { statusCode: 404 });
  }
  const notif = result.rows[0];
  socket.emitToUser(userId, EVENTS.NOTIFICATION_READ, { id: notif.id });
  return notif;
};

/**
 * Mark all notifications read for a user
 */
exports.markAllRead = async (userId) => {
  await db.query(
    'UPDATE notifications SET is_read = true WHERE user_id = $1',
    [userId]
  );
  socket.emitToUser(userId, EVENTS.NOTIFICATION_ALL_READ, {});
  return { success: true };
};

/**
 * Delete a notification
 */
exports.deleteNotification = async (id, userId) => {
  const result = await db.query('DELETE FROM notifications WHERE id=$1 AND user_id=$2 RETURNING id', [id, userId]);
  if (!result.rows.length) {
    throw Object.assign(new Error('Notification not found'), { statusCode: 404 });
  }
  socket.emitToUser(userId, EVENTS.NOTIFICATION_DELETED, { id });
};
