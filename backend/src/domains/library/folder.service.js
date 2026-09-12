const db = require('../../core/config/db');

exports.getFolders = async () => {
    const result = await db.query(`SELECT * FROM library_folders ORDER BY name ASC`);
    return result.rows;
};

exports.createFolder = async (data) => {
    const result = await db.query(
        `INSERT INTO library_folders (name, parent_id) VALUES ($1, $2) RETURNING *`,
        [data.name, data.parent_id || null]
    );
    return result.rows[0];
};

exports.updateFolder = async (id, data) => {
    const result = await db.query(
        `UPDATE library_folders SET name = COALESCE($1, name), parent_id = COALESCE($2, parent_id) WHERE id = $3 RETURNING *`,
        [data.name, data.parent_id, id]
    );
    if (!result.rows.length) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
    return result.rows[0];
};

exports.deleteFolder = async (id) => {
    const result = await db.query(`DELETE FROM library_folders WHERE id = $1 RETURNING id`, [id]);
    if (!result.rows.length) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
    return true;
};
