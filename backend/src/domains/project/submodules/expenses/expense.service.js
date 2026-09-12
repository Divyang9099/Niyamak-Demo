const db = require('../../../../core/config/db');

const VALID_METHODS    = ['cash', 'online', 'card', 'cheque', 'upi'];
const VALID_CATEGORIES = ['fuel', 'accommodation', 'equipment', 'labour', 'food', 'travel', 'general', 'misc'];

// ── CREATE ──────────────────────────────────────────────────────────────────
exports.createExpense = async (projectId, userId, data) => {
  const { method, bank_name, category, description, expense_date, amount, member_id } = data;

  if (!amount || isNaN(amount) || Number(amount) <= 0)
    throw Object.assign(new Error('amount must be a positive number'), { statusCode: 400 });
  if (!expense_date)
    throw Object.assign(new Error('expense_date is required'), { statusCode: 400 });
  if (method && !VALID_METHODS.includes(method))
    throw Object.assign(new Error(`method must be one of: ${VALID_METHODS.join(', ')}`), { statusCode: 400 });
  if (category && !VALID_CATEGORIES.includes(category))
    throw Object.assign(new Error(`category must be one of: ${VALID_CATEGORIES.join(', ')}`), { statusCode: 400 });

  // Verify project exists
  const proj = await db.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!proj.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

  // If member_id provided, verify they are a member of this project
  if (member_id) {
    const mem = await db.query(
      'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, member_id]
    );
    if (!mem.rows.length)
      throw Object.assign(new Error('Selected member is not part of this project'), { statusCode: 400 });
  }

  const result = await db.query(
    `INSERT INTO project_expenses
       (project_id, added_by, member_id, method, bank_name, category, description, expense_date, amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [projectId, userId, member_id || null, method || 'cash', bank_name || null,
     category || 'general', description || null, expense_date, amount]
  );

  // Enrich with adder + member names
  return enrichExpense(result.rows[0]);
};

// ── LIST ─────────────────────────────────────────────────────────────────────
exports.getExpenses = async (projectId) => {
  const proj = await db.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!proj.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

  const result = await db.query(
    `SELECT e.*,
            u1.name AS added_by_name,
            u2.name AS member_name
     FROM project_expenses e
     LEFT JOIN users u1 ON u1.id = e.added_by
     LEFT JOIN users u2 ON u2.id = e.member_id
     WHERE e.project_id = $1
     ORDER BY e.expense_date DESC, e.created_at DESC`,
    [projectId]
  );

  const rows = result.rows;

  // Aggregate stats
  const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);

  // Category breakdown for chart
  const byCategory = {};
  rows.forEach(r => {
    byCategory[r.category] = (byCategory[r.category] || 0) + parseFloat(r.amount);
  });

  // Daily totals for chart
  const byDate = {};
  rows.forEach(r => {
    const day = r.expense_date instanceof Date
      ? r.expense_date.toISOString().split('T')[0]
      : String(r.expense_date).split('T')[0];
    if (!byDate[day]) byDate[day] = {};
    byDate[day][r.category] = (byDate[day][r.category] || 0) + parseFloat(r.amount);
  });

  const dailyChart = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cats]) => ({ date, ...cats }));

  return { expenses: rows, total, byCategory, dailyChart };
};

// ── DELETE ────────────────────────────────────────────────────────────────────
exports.deleteExpense = async (projectId, expenseId, userId, isAdmin) => {
  const row = await db.query(
    'SELECT * FROM project_expenses WHERE id = $1 AND project_id = $2',
    [expenseId, projectId]
  );
  if (!row.rows.length) throw Object.assign(new Error('Expense not found'), { statusCode: 404 });

  // Only admin or the person who added it can delete
  if (!isAdmin && row.rows[0].added_by !== userId)
    throw Object.assign(new Error('Not authorised to delete this expense'), { statusCode: 403 });

  await db.query('DELETE FROM project_expenses WHERE id = $1', [expenseId]);
};

// ── DELETE ALL ────────────────────────────────────────────────────────────────
exports.deleteAllExpenses = async (projectId, userId, isAdmin) => {
  const proj = await db.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!proj.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

  // Same rule as single delete: admin wipes everything, others only their own rows
  const result = isAdmin
    ? await db.query('DELETE FROM project_expenses WHERE project_id = $1', [projectId])
    : await db.query('DELETE FROM project_expenses WHERE project_id = $1 AND added_by = $2', [projectId, userId]);

  return { deleted: result.rowCount };
};

// ── BULK IMPORT ───────────────────────────────────────────────────────────────
exports.bulkCreateExpenses = async (projectId, userId, rows) => {
  if (!Array.isArray(rows) || !rows.length)
    throw Object.assign(new Error('No rows provided'), { statusCode: 400 });

  const proj = await db.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!proj.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const amount = Number(r.amount);
      if (!r.expense_date || isNaN(amount) || amount <= 0) {
        errors.push({ row: i + 1, reason: 'Invalid amount or missing date' });
        continue;
      }
      const category = VALID_CATEGORIES.includes(r.category) ? r.category : 'general';
      const method   = VALID_METHODS.includes(r.method)   ? r.method   : 'cash';

      await client.query(
        `INSERT INTO project_expenses
           (project_id, added_by, method, category, description, expense_date, amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [projectId, userId, method, category, r.description || null, r.expense_date, amount]
      );
      inserted++;
    }

    await client.query('COMMIT');
    return { inserted, errors };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────
async function enrichExpense(expense) {
  const [[u1], [u2]] = await Promise.all([
    db.query('SELECT name FROM users WHERE id = $1', [expense.added_by]).then(r => [r.rows[0]]),
    expense.member_id
      ? db.query('SELECT name FROM users WHERE id = $1', [expense.member_id]).then(r => [r.rows[0]])
      : Promise.resolve([null]),
  ]);
  return {
    ...expense,
    added_by_name: u1?.name || null,
    member_name:   u2?.name || null,
  };
}
