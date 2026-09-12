const db = require('../../core/config/db');

exports.getCategories = async () => {
  const result = await db.query('SELECT * FROM library_categories ORDER BY name ASC');
  return result.rows;
};

exports.createCategory = async (data) => {
  if (!data.name || data.name.trim() === '') {
    throw Object.assign(new Error('Category name is required'), { statusCode: 400 });
  }

  const result = await db.query(
    'INSERT INTO library_categories (name) VALUES ($1) RETURNING *',
    [data.name.trim()]
  );
  return result.rows[0];
};

exports.updateCategory = async (id, data) => {
  if (data.name !== undefined && data.name.trim() === '') {
    throw Object.assign(new Error('Category name cannot be empty'), { statusCode: 400 });
  }

  const result = await db.query(
    'UPDATE library_categories SET name=COALESCE($1, name) WHERE id=$2 RETURNING *',
    [data.name ? data.name.trim() : null, id]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('Category not found'), { statusCode: 404 });
  }
  return result.rows[0];
};

exports.deleteCategory = async (id) => {
  const result = await db.query('DELETE FROM library_categories WHERE id=$1 RETURNING id', [id]);
  if (!result.rows.length) {
    throw Object.assign(new Error('Category not found'), { statusCode: 404 });
  }
};
