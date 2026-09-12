const db = require('../../core/config/db');

const CATEGORIES = ['allocation', 'expiry', 'project_status', 'system'];

exports.getPrefs = async (userId) => {
  // Return prefs for all known categories; seed defaults for any missing rows
  const existing = await db.query(
    'SELECT category, email_enabled, in_app_enabled FROM user_notification_prefs WHERE user_id = $1',
    [userId]
  );

  const map = {};
  for (const row of existing.rows) map[row.category] = row;

  // Fill missing categories with defaults
  const result = CATEGORIES.map(cat => ({
    category: cat,
    email_enabled:  map[cat]?.email_enabled  ?? true,
    in_app_enabled: map[cat]?.in_app_enabled ?? true,
  }));

  return result;
};

exports.updatePrefs = async (userId, prefs) => {
  // prefs: [{ category, email_enabled, in_app_enabled }, ...]
  if (!Array.isArray(prefs) || prefs.length === 0) {
    throw Object.assign(new Error('prefs must be a non-empty array'), { statusCode: 400 });
  }

  for (const p of prefs) {
    if (!CATEGORIES.includes(p.category)) continue; // silently ignore unknown categories
    await db.query(
      `INSERT INTO user_notification_prefs (user_id, category, email_enabled, in_app_enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, category) DO UPDATE SET
         email_enabled  = EXCLUDED.email_enabled,
         in_app_enabled = EXCLUDED.in_app_enabled`,
      [userId, p.category, p.email_enabled ?? true, p.in_app_enabled ?? true]
    );
  }

  return exports.getPrefs(userId);
};

exports.CATEGORIES = CATEGORIES;
