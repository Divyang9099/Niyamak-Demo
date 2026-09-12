// Proves BLOCKER 1 end-to-end: the estimation API rejects non-admin tokens
// before any controller/DB work happens. DB is mocked so no Postgres is needed.
jest.mock('../../src/core/config/db', () => {
  return {
    query: jest.fn().mockImplementation((sql, params) => {
      if (sql && sql.includes('FROM users')) {
        const userId = params[0];
        const role = userId ? userId.split('-')[1] : 'admin';
        return Promise.resolve({
          rows: [{
            id: userId,
            email: `${role}@varuna.test`,
            role: role,
            deleted_at: null,
            tokens_valid_after: null
          }]
        });
      }
      return Promise.resolve({ rows: [] });
    })
  };
});

const express  = require('express');
const request  = require('supertest');
const jwt      = require('jsonwebtoken');
const estimationRoutes = require('../../src/domains/estimation/estimation.routes');

const SECRET = process.env.JWT_SECRET; // set to 'test_jwt_secret' by tests/setup.js
const tokenFor = (role) =>
  jwt.sign({ id: `user-${role}`, email: `${role}@varuna.test`, role }, SECRET);

const app = express();
app.use(express.json());
app.use('/api/v1/estimations', estimationRoutes);

describe('Estimation API RBAC (admin-only)', () => {
  test('no token → 401', async () => {
    const res = await request(app).get('/api/v1/estimations');
    expect(res.status).toBe(401);
  });

  test('pilot token → 403', async () => {
    const res = await request(app)
      .get('/api/v1/estimations')
      .set('Authorization', `Bearer ${tokenFor('pilot')}`);
    expect(res.status).toBe(403);
  });

  test('project_manager token → 403 (cannot read estimations)', async () => {
    const res = await request(app)
      .get('/api/v1/estimations')
      .set('Authorization', `Bearer ${tokenFor('project_manager')}`);
    expect(res.status).toBe(403);
  });

  test('project_manager cannot CREATE estimations either', async () => {
    const res = await request(app)
      .post('/api/v1/estimations')
      .set('Authorization', `Bearer ${tokenFor('project_manager')}`)
      .send({ client_name: 'X' });
    expect(res.status).toBe(403);
  });

  test('admin token is NOT blocked by the role guard', async () => {
    const res = await request(app)
      .get('/api/v1/estimations')
      .set('Authorization', `Bearer ${tokenFor('admin')}`);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  test('rate-cards read is available to any authenticated role', async () => {
    const res = await request(app)
      .get('/api/v1/estimations/rate-cards')
      .set('Authorization', `Bearer ${tokenFor('project_manager')}`);
    expect(res.status).not.toBe(403); // PMs may read rate cards, just not estimations
  });
});
