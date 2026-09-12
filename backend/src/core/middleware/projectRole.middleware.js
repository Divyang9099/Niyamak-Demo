const db     = require('../config/db');
const { error } = require('../utils/response');

/**
 * Checks the role column inside project_members for the current user.
 * requireProjectRole('project_manager') — only PMs assigned to the project
 * can perform sensitive actions (scope, map, members CRUD).
 * Admin always bypasses. If the user is not a project member at all,
 * this returns 403 before checking role.
 */
const requireProjectRole = (...allowedProjectRoles) => {
  return async (req, res, next) => {
    try {
      const projectId = req.params.id || req.params.projectId;
      const user = req.user;

      if (!user) return res.status(401).json(error('Authentication required', 401));

      // Admin / super_admin have universal access
      if (user.role === 'admin' || user.role === 'super_admin') return next();

      // Check project_members role column
      const result = await db.query(
        'SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2',
        [projectId, user.id]
      );

      // Specific, human-readable message when PM access is the sole requirement
      const pmOnly = allowedProjectRoles.length === 1 && allowedProjectRoles[0] === 'project_manager';

      if (!result.rows.length) {
        return res.status(403).json(error(
          pmOnly ? 'Not a project manager on this project.' : 'Access denied. You are not a member of this project.',
          403
        ));
      }

      const projectRole = result.rows[0].role;
      if (!allowedProjectRoles.includes(projectRole)) {
        return res.status(403).json(error(
          pmOnly ? 'Not a project manager on this project.' : `Access denied. Required project role: ${allowedProjectRoles.join(' or ')}`,
          403
        ));
      }

      next();
    } catch (err) { next(err); }
  };
};

module.exports = requireProjectRole;
