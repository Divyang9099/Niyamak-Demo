const db = require('../../core/config/db');

/**
 * Returns all active rate cards, grouped by category — perfect for the
 * estimator UI to populate its dropdowns. Includes the company-level
 * cost-engine defaults (overhead, margin, contingency, tax, per-diem).
 */
exports.getAllGrouped = async () => {
  const cards = await db.query(
    `SELECT id, category, item_name, unit, rate, description, sort_order, is_active
       FROM estimation_rate_cards
      WHERE is_active = TRUE
      ORDER BY category, sort_order, item_name`
  );

  const grouped = {};
  for (const c of cards.rows) {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push({
      id:          c.id,
      key:         c.item_name,
      label:       (c.description || c.item_name).split(' ')[0] === c.item_name
                     ? c.item_name : c.item_name,
      name:        c.item_name,
      description: c.description,
      unit:        c.unit,
      rate:        Number(c.rate),
      sort_order:  c.sort_order,
    });
  }

  // Pull cost-engine defaults from company_config
  const cfg = await db.query(
    `SELECT default_overhead_percent, default_margin_percent,
            default_contingency_percent, default_tax_percent,
            default_per_diem_amount
       FROM company_config LIMIT 1`
  );
  const c = cfg.rows[0] || {};

  return {
    rate_cards: grouped,
    defaults: {
      overhead_percent:    Number(c.default_overhead_percent    ?? 10),
      margin_percent:      Number(c.default_margin_percent      ?? 20),
      contingency_percent: Number(c.default_contingency_percent ?? 5),
      tax_percent:         Number(c.default_tax_percent         ?? 18),
      per_diem_amount:     Number(c.default_per_diem_amount     ?? 1500),
    },
  };
};

exports.listAll = async () => {
  const r = await db.query(
    `SELECT id, category, item_name, unit, rate, description, sort_order, is_active,
            created_at, updated_at
       FROM estimation_rate_cards
      ORDER BY category, sort_order, item_name`
  );
  return r.rows;
};

exports.create = async (data) => {
  const r = await db.query(
    `INSERT INTO estimation_rate_cards
       (category, item_name, unit, rate, description, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,0),COALESCE($7,TRUE))
     RETURNING *`,
    [data.category, data.item_name, data.unit || null, data.rate,
     data.description || null, data.sort_order, data.is_active]
  );
  return r.rows[0];
};

exports.update = async (id, data) => {
  const r = await db.query(
    `UPDATE estimation_rate_cards SET
       unit        = COALESCE($1, unit),
       rate        = COALESCE($2, rate),
       description = COALESCE($3, description),
       sort_order  = COALESCE($4, sort_order),
       is_active   = COALESCE($5, is_active),
       updated_at  = NOW()
     WHERE id = $6
     RETURNING *`,
    [data.unit !== undefined ? data.unit : null,
     data.rate !== undefined ? data.rate : null,
     data.description !== undefined ? data.description : null,
     data.sort_order !== undefined ? data.sort_order : null,
     data.is_active !== undefined ? data.is_active : null,
     id]
  );
  if (!r.rows.length) throw Object.assign(new Error('Rate card not found'), { statusCode: 404 });
  return r.rows[0];
};

exports.remove = async (id) => {
  const r = await db.query(
    `DELETE FROM estimation_rate_cards WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!r.rows.length) throw Object.assign(new Error('Rate card not found'), { statusCode: 404 });
  return r.rows[0];
};
