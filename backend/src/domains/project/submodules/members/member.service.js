const db            = require('../../../../core/config/db');
const socket        = require('../../../../core/socket/socket.gateway');
const EVENTS        = require('../../../../core/socket/socket.events');
const notifService  = require('../../../notification/notification.service');
const emailTriggers = require('../../../notification/emailTriggers.service');

// ADD MEMBER TO PROJECT
exports.addMember = async (projectId, data) => {
  const { user_id, role } = data;

  if (!user_id) throw Object.assign(new Error('user_id is required'), { statusCode: 400 });

  const proj = await db.query('SELECT id, name FROM projects WHERE id = $1', [projectId]);
  if (!proj.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

  const user = await db.query('SELECT id, name, email, role FROM users WHERE id = $1', [user_id]);
  if (!user.rows.length) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  const exists = await db.query(
    'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, user_id]
  );
  if (exists.rows.length) throw Object.assign(new Error('User is already a member of this project'), { statusCode: 409 });

  const result = await db.query(
    `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3) RETURNING *`,
    [projectId, user_id, role || user.rows[0].role]
  );

  const member = { ...result.rows[0], user: user.rows[0] };

  const assignedRole = role || user.rows[0].role;
  const projectName  = proj.rows[0].name;

  // In-app notification to added user
  notifService.createNotification({
    user_id:     user_id,
    category:    'project_status',
    title:       'Added to Project',
    message:     `You have been added to project "${projectName}" as ${assignedRole.replace('_', ' ')}.`,
    entity_type: 'project',
    entity_id:   projectId,
  }).catch(() => {});

  // Email notification to added user
  emailTriggers.onMemberAdded({
    userId:      user_id,
    userEmail:   user.rows[0].email,
    userName:    user.rows[0].name,
    projectName,
    role:        assignedRole,
  });

  try { socket.emitToProject(projectId, EVENTS.PROJECT_MEMBER_ADDED, member); } catch (_) {}
  return member;
};

// GET ALL MEMBERS OF A PROJECT
exports.getMembers = async (projectId) => {
  const proj = await db.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!proj.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

  const result = await db.query(
    `SELECT pm.id, pm.role, pm.project_id,
            u.id as user_id, u.name, u.email, u.role as system_role, u.phone
     FROM project_members pm
     JOIN users u ON pm.user_id = u.id
     WHERE pm.project_id = $1
     ORDER BY u.name ASC`,
    [projectId]
  );
  return result.rows;
};

// UPDATE MEMBER ROLE
exports.updateMember = async (projectId, userId, data) => {
  const { role } = data;
  if (!role) throw Object.assign(new Error('role is required'), { statusCode: 400 });

  const result = await db.query(
    `UPDATE project_members SET role = $1
     WHERE project_id = $2 AND user_id = $3 RETURNING *`,
    [role, projectId, userId]
  );
  if (!result.rows.length) throw Object.assign(new Error('Member not found in this project'), { statusCode: 404 });

  try { socket.emitToProject(projectId, EVENTS.PROJECT_MEMBER_ADDED, result.rows[0]); } catch (_) {}
  return result.rows[0];
};

// REMOVE MEMBER FROM PROJECT
exports.removeMember = async (projectId, userId) => {
  // Get project name and user name before deleting
  const [proj, user] = await Promise.all([
    db.query('SELECT name FROM projects WHERE id = $1', [projectId]),
    db.query('SELECT name FROM users WHERE id = $1', [userId]),
  ]);

  const result = await db.query(
    'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 RETURNING id',
    [projectId, userId]
  );
  if (!result.rows.length) throw Object.assign(new Error('Member not found in this project'), { statusCode: 404 });

  // Notify the removed user
  notifService.createNotification({
    user_id:  userId,
    category: 'project_status',
    title:    'Removed from Project',
    message:  `You have been removed from project "${proj.rows[0]?.name || projectId}".`,
  }).catch(() => {});

  try { socket.emitToProject(projectId, EVENTS.PROJECT_MEMBER_REMOVED, { projectId, userId }); } catch (_) {}

  // Evict the removed user's live sockets from the project room so they stop
  // receiving project-scoped realtime broadcasts before their next reconnect.
  try { socket.evictUserFromProject(userId, projectId); } catch (_) {}
};
