const db = require('../../core/config/db');

exports.getTags = async () => {
    const result = await db.query(`SELECT * FROM library_tags ORDER BY name ASC`);
    return result.rows;
};

exports.createTag = async (data) => {
    const result = await db.query(
        `INSERT INTO library_tags (name) VALUES ($1) RETURNING *`,
        [data.name]
    );
    return result.rows[0];
};

exports.deleteTag = async (id) => {
    const result = await db.query(`DELETE FROM library_tags WHERE id = $1 RETURNING id`, [id]);
    if (!result.rows.length) throw Object.assign(new Error('Tag not found'), { statusCode: 404 });
    return true;
};
