const authorize = require('../../src/core/middleware/role.middleware');

// Builds a fake (req,res,next) trio with a spyable res.status().json()
const mkCtx = (user) => {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const res = { status, json };
  const next = jest.fn();
  return { req: { user }, res, next, status, json };
};

describe('authorize() global role guard', () => {
  test('passes when user role is allowed', () => {
    const { req, res, next } = mkCtx({ role: 'admin' });
    authorize('admin', 'project_manager')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('401 when no user on request', () => {
    const { req, res, next, status } = mkCtx(undefined);
    authorize('admin')(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 when role is not allowed', () => {
    const { req, res, next, status } = mkCtx({ role: 'pilot' });
    authorize('admin')(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  // BLOCKER 1 regression guard: estimations are admin-only. A project_manager
  // must be rejected by authorize('admin').
  test('project_manager is rejected by admin-only guard (estimation RBAC)', () => {
    const { req, res, next, status } = mkCtx({ role: 'project_manager' });
    authorize('admin')(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
