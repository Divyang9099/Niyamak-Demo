const db = require('../../core/config/db');
const audit = require('../audit/audit.service');

// ADD ITEM TO ESTIMATION
exports.addItem = async (estimationId, data, userId) => {
  const { category, description, quantity, unit_cost } = data;

  if (!category || !description || !quantity || !unit_cost) {
    throw Object.assign(new Error('category, description, quantity, and unit_cost are required'), { statusCode: 400 });
  }

  // Check estimation exists
  const est = await db.query('SELECT id FROM estimations WHERE id = $1', [estimationId]);
  if (!est.rows.length) throw Object.assign(new Error('Estimation not found'), { statusCode: 404 });

  const total_cost = parseFloat(quantity) * parseFloat(unit_cost);

  const result = await db.query(
    `INSERT INTO estimation_items (estimation_id, category, description, quantity, unit_cost, total_cost)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [estimationId, category, description, quantity, unit_cost, total_cost]
  );
  
  const item = result.rows[0];

  // Recalculate estimation total from all items
  await recalcEstimationTotal(estimationId);

  // 📝 LOG AUDIT
  await audit.log({
    user_id: userId,
    action: 'ADD_ESTIMATION_ITEM',
    entity_type: 'estimation',
    entity_id: estimationId,
    new_value: item
  });

  return item;
};

// GET ALL ITEMS FOR AN ESTIMATION
exports.getItems = async (estimationId) => {
  const est = await db.query('SELECT id FROM estimations WHERE id = $1', [estimationId]);
  if (!est.rows.length) throw Object.assign(new Error('Estimation not found'), { statusCode: 404 });

  const result = await db.query(
    'SELECT * FROM estimation_items WHERE estimation_id = $1 ORDER BY created_at ASC',
    [estimationId]
  );
  return result.rows;
};

// UPDATE ITEM
exports.updateItem = async (estimationId, itemId, data) => {
  const { category, description, quantity, unit_cost } = data;

  const check = await db.query(
    'SELECT * FROM estimation_items WHERE id = $1 AND estimation_id = $2',
    [itemId, estimationId]
  );
  if (!check.rows.length) throw Object.assign(new Error('Item not found'), { statusCode: 404 });
  const existing = check.rows[0];

  // Recalculate total_cost based on new OR existing values
  const q = quantity !== undefined ? parseFloat(quantity) : parseFloat(existing.quantity);
  const u = unit_cost !== undefined ? parseFloat(unit_cost) : parseFloat(existing.unit_cost);
  const total_cost = q * u;

  const result = await db.query(
    `UPDATE estimation_items
     SET category    = $1,
         description = $2,
         quantity    = $3,
         unit_cost   = $4,
         total_cost  = $5
     WHERE id = $6 AND estimation_id = $7
     RETURNING *`,
    [
      category !== undefined ? category : existing.category,
      description !== undefined ? description : existing.description,
      q,
      u,
      total_cost,
      itemId,
      estimationId
    ]
  );

  await recalcEstimationTotal(estimationId);
  return result.rows[0];
};

// DELETE ITEM
exports.deleteItem = async (estimationId, itemId) => {
  const result = await db.query(
    'DELETE FROM estimation_items WHERE id = $1 AND estimation_id = $2 RETURNING id',
    [itemId, estimationId]
  );
  if (!result.rows.length) throw Object.assign(new Error('Item not found'), { statusCode: 404 });

  await recalcEstimationTotal(estimationId);
};

// INTERNAL: Recalculate total_cost on the parent estimation from all its items
async function recalcEstimationTotal(estimationId) {
  // 1. Get sum of items
  const itemsRes = await db.query(
    'SELECT COALESCE(SUM(total_cost), 0) AS base_cost FROM estimation_items WHERE estimation_id = $1',
    [estimationId]
  );
  const baseCost = parseFloat(itemsRes.rows[0].base_cost);

  // 2. Get estimation details
  const estRes = await db.query('SELECT details FROM estimations WHERE id = $1', [estimationId]);
  if (!estRes.rows.length) return;
  const details = estRes.rows[0].details || {};
  const inputs = details.inputs || {};

  const marginPercent = Number(inputs.margin_percent) || 0;
  const taxPercent = Number(inputs.tax_percent) || 0;

  const margin = (baseCost * marginPercent) / 100;
  const subtotal = baseCost + margin;
  const tax = (subtotal * taxPercent) / 100;
  const total = subtotal + tax;

  // Ensure breakdown object exists and is updated
  details.breakdown = details.breakdown || {};
  details.breakdown.baseCost = baseCost;
  details.breakdown.margin = margin;
  details.breakdown.subtotal = subtotal;
  details.breakdown.tax = tax;
  details.breakdown.total = total;

  // 3. Update estimation
  await db.query(
    `UPDATE estimations
     SET total_cost = $1,
         margin = $2,
         tax = $3,
         details = $4
     WHERE id = $5`,
    [total, margin, tax, JSON.stringify(details), estimationId]
  );
}
