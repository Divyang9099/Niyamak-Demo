const pool = require('../../core/config/db');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const r2  = require('../../core/config/r2');
const env = require('../../core/config/env');
const { uploadToR2, deleteFromR2 } = require('../../core/utils/r2Upload');
const sessionGuard = require('../../core/utils/sessionGuard');

/**
 * Get all users (admin only) — excludes soft-deleted accounts
 */
const getAllUsers = async () => {
  const result = await pool.query(
    "SELECT id, name, email, role, phone, avatar_url, created_at FROM users WHERE deleted_at IS NULL AND role != 'super_admin' ORDER BY created_at DESC"
  );
  return result.rows;
};

/**
 * Get single user by ID
 */
const getUserById = async (id) => {
  const result = await pool.query(
    'SELECT id, name, email, role, phone, avatar_url, created_at FROM users WHERE id = $1',
    [id]
  );
  if (result.rows.length === 0) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }
  return result.rows[0];
};

/**
 * Update user
 */
const updateUser = async (id, { name, role, phone }) => {
  const result = await pool.query(
    `UPDATE users SET name = COALESCE($1, name), role = COALESCE($2, role), phone = COALESCE($3, phone)
     WHERE id = $4
     RETURNING id, name, email, role, phone, created_at`,
    [name, role, phone, id]
  );
  if (result.rows.length === 0) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }
  // H-4: drop the cached session state so a role change applies on the next request
  // (the auth middleware reads the live role) instead of lagging up to 30s/8h.
  sessionGuard.invalidate(id);
  return result.rows[0];
};

/**
 * Delete user — SOFT delete (sets deleted_at). A hard DELETE violates the many
 * foreign keys that reference users (project_members, pilots, allocations,
 * audit_logs, …). Soft-delete keeps history intact, frees the user from project
 * rooms/rosters, and the login + listing queries already filter deleted_at.
 */
const deleteUser = async (id, requestingUserId) => {
  if (id === requestingUserId)
    throw Object.assign(new Error('You cannot delete your own account.'), { statusCode: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify the user exists and isn't already deleted
    const u = await client.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!u.rows.length) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 });
    }

    // If this user is a pilot with future allocations, block — deallocate first
    // (mirrors the pilot-delete rule so allocations aren't orphaned).
    const activeAllocs = await client.query(
      `SELECT a.id FROM allocations a
         JOIN pilots p ON a.pilot_id = p.id
        WHERE p.user_id = $1 AND a.end_date >= CURRENT_DATE
        LIMIT 1`,
      [id]
    );
    if (activeAllocs.rows.length) {
      throw Object.assign(
        new Error('Cannot delete: this user is a pilot with active project allocations. Deallocate them first.'),
        { statusCode: 409 }
      );
    }

    // Free the user from all project memberships
    await client.query('DELETE FROM project_members WHERE user_id = $1', [id]);

    // Soft-delete their pilot record (removes from roster) if one exists
    await client.query('UPDATE pilots SET deleted_at = NOW() WHERE user_id = $1 AND deleted_at IS NULL', [id]);

    // Soft-delete the user account
    await client.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [id]);

    await client.query('COMMIT');
    // H-4: kill the deactivated user's active sessions immediately (clear cache so
    // the auth middleware sees deleted_at on the very next request/socket).
    sessionGuard.invalidate(id);
    return { deleted: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Profile picture (avatar) — stored in R2 under the `avatars/` prefix; the users
 * row keeps only the object KEY. Mirrors the company-logo pattern in system.service.
 */
const setAvatar = async (userId, file) => {
  // Upload first so a DB write never points at a missing object.
  const key = await uploadToR2(file, 'avatars');

  const prev = await pool.query(
    'SELECT avatar_url FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId]
  );
  if (!prev.rows.length) {
    // Target user vanished/deleted between auth and write — clean up the orphan object.
    deleteFromR2(key).catch(() => {});
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  const oldKey = prev.rows[0].avatar_url;
  await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [key, userId]);

  // Best-effort delete of the previous image so R2 doesn't accumulate dead avatars.
  if (oldKey && oldKey !== key) deleteFromR2(oldKey).catch(() => {});
  return key;
};

const getAvatarStream = async (userId) => {
  const result = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [userId]);
  const key = result.rows[0]?.avatar_url;
  if (!key) throw Object.assign(new Error('No avatar set'), { statusCode: 404 });

  const response = await r2.send(new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }));
  return { stream: response.Body, contentType: response.ContentType || 'image/jpeg' };
};

const removeAvatar = async (userId) => {
  const result = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [userId]);
  const key = result.rows[0]?.avatar_url;
  await pool.query('UPDATE users SET avatar_url = NULL WHERE id = $1', [userId]);
  if (key) deleteFromR2(key).catch(() => {});
  return { removed: true };
};

module.exports = { getAllUsers, getUserById, updateUser, deleteUser, setAvatar, getAvatarStream, removeAvatar };
