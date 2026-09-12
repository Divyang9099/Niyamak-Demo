const { error } = require('../utils/response');

/**
 * Role-based access control middleware
 * Usage: authorize('admin', 'project_manager')
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(error('Authentication required.', 401));
    }

    // super_admin has all admin privileges
    const effectiveRole = req.user.role === 'super_admin' ? 'admin' : req.user.role;
    if (!allowedRoles.includes(effectiveRole)) {
      return res.status(403).json(
        error(`Access denied. Required role: ${allowedRoles.join(' or ')}`, 403)
      );
    }

    next();
  };
};

module.exports = authorize;
