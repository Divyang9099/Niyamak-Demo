// Mock the DB module the middleware imports so no real Postgres connection is made.
jest.mock('../../src/core/config/db', () => ({ query: jest.fn() }));

const db = require('../../src/core/config/db');
const requireProjectRole = require('../../src/core/middleware/projectRole.middleware');

const mkCtx = (user, params = { id: 'proj-1' }) => {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const res = { status, json };
  const next = jest.fn();
  return { req: { user, params }, res, next, status, json };
};

describe('requireProjectRole() per-project guard', () => {
  beforeEach(() => db.query.mockReset());

  test('global admin bypasses without a DB lookup', async () => {
    const { req, res, next } = mkCtx({ id: 'u1', role: 'admin' });
    await requireProjectRole('project_manager')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('401 when unauthenticated', async () => {
    const { req, res, next, status } = mkCtx(undefined);
    await requireProjectRole('project_manager')(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 when user is not a member of the project', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const { req, res, next, status, json } = mkCtx({ id: 'u2', role: 'pilot' });
    await requireProjectRole('project_manager')(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Not a project manager on this project.' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('403 when member has the wrong project role', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ role: 'pilot' }] });
    const { req, res, next, status } = mkCtx({ id: 'u3', role: 'pilot' });
    await requireProjectRole('project_manager')(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('passes when member has the required project role', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ role: 'project_manager' }] });
    const { req, res, next } = mkCtx({ id: 'u4', role: 'project_manager' });
    await requireProjectRole('project_manager')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
