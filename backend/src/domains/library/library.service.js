const db     = require('../../core/config/db');
const audit  = require('../audit/audit.service');
const socket = require('../../core/socket/socket.gateway');
const EVENTS = require('../../core/socket/socket.events');

exports.getDocuments = async (query, userRole) => {
  const conditions = ['d.deleted_at IS NULL', "d.archived_at IS NULL"];
  const values = [];

  // Non-admins can only see 'all' access_level documents
  if (userRole !== 'admin') {
    conditions.push(`d.access_level = 'all'`);
  }

  if (query.category_id) {
    values.push(query.category_id);
    conditions.push(`d.category_id = $${values.length}`);
  }

  if (query.folder_id) {
    values.push(query.folder_id);
    conditions.push(`d.folder_id = $${values.length}`);
  }

  if (query.folder_id === 'null' || query.folder_id === null) {
    conditions.push(`d.folder_id IS NULL`);
  }

  if (query.search) {
    values.push(`%${query.search}%`);
    conditions.push(`(d.name ILIKE $${values.length} OR d.description ILIKE $${values.length})`);
  }

  if (query.access_level) {
    values.push(query.access_level);
    conditions.push(`d.access_level = $${values.length}`);
  }

  if (query.archived === 'true') {
    // Show archived instead of filtering them out
    conditions.splice(conditions.indexOf('d.archived_at IS NULL'), 1);
    conditions.push('d.archived_at IS NOT NULL');
  }

  const safeLimit = Math.min(Math.max(Number(query.limit) || 50, 1), 500);
  const safeOffset = (Math.max(Number(query.page) || 1, 1) - 1) * safeLimit;

  values.push(safeLimit);
  values.push(safeOffset);

  const result = await db.query(
    `SELECT d.*, c.name AS category_name, u.name AS uploaded_by_name
     FROM library_documents d
     LEFT JOIN library_categories c ON d.category_id = c.id
     LEFT JOIN users u ON d.uploaded_by = u.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY d.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return result.rows;
};

exports.createDocument = async (data, userId) => {
  const result = await db.query(
    `INSERT INTO library_documents
     (category_id, folder_id, name, description, file_name, file_key, file_size, file_type, version, uploaded_by, access_level)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'v1',$9,$10)
     RETURNING *`,
    [
      data.category_id  || null,
      data.folder_id    || null,
      data.name         || null,
      data.description  || null,
      data.file_name    || null,
      data.file_key     || null,
      data.file_size    || null,  // populated from req.file.size in controller
      data.file_type    || null,
      userId,
      data.access_level || 'all',
    ]
  );

  const doc = result.rows[0];

  // Map Tags if provided
  if (data.tags && Array.isArray(data.tags)) {
      for (const tagId of data.tags) {
          await db.query(`INSERT INTO library_file_tags (document_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [doc.id, tagId]);
      }
  }

  // Create the first version history entry
  await db.query(
    `INSERT INTO library_versions (document_id, file_key, file_name, file_size, file_type, uploaded_by, version)
     VALUES ($1,$2,$3,$4,$5,$6,'v1')`,
    [doc.id, data.file_key || null, data.file_name || null, data.file_size || null, data.file_type || null, userId]
  );

  // 📝 LOG AUDIT
  await audit.log({
    user_id: userId,
    action: 'UPLOAD_LIBRARY_DOC',
    entity_type: 'library_document',
    entity_id: doc.id,
    new_value: doc
  });

  try { socket.emitToAll(EVENTS.LIBRARY_DOC_UPLOADED, doc); } catch (_) {}

  return doc;
};

exports.updateDocument = async (id, data) => {
  // 1. Get existing to merge
  const check = await db.query('SELECT * FROM library_documents WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!check.rows.length) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  const existing = check.rows[0];

  // 2. Perform state-aware update
  const result = await db.query(
    `UPDATE library_documents
     SET 
       name         = $1,
       description  = $2,
       category_id  = $3,
       file_key     = $4,
       file_name    = $5,
       access_level = $6
     WHERE id = $7 AND deleted_at IS NULL
     RETURNING *`,
    [
      data.name         !== undefined ? data.name         : existing.name,
      data.description  !== undefined ? data.description  : existing.description,
      data.category_id  !== undefined ? data.category_id  : existing.category_id,
      data.file_key     !== undefined ? data.file_key     : existing.file_key,
      data.file_name    !== undefined ? data.file_name    : existing.file_name,
      data.access_level !== undefined ? data.access_level : existing.access_level,
      id
    ]
  );
  return result.rows[0];
};

/**
 * Archive a document (soft-archive, keeps it in DB but hidden from normal listing)
 */
exports.archiveDocument = async (id, userId) => {
  const result = await db.query(
    `UPDATE library_documents
     SET archived_at = NOW(), archived_by = $2
     WHERE id = $1 AND deleted_at IS NULL AND archived_at IS NULL
     RETURNING id`,
    [id, userId || null]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('Document not found or already archived'), { statusCode: 404 });
  }
};

exports.deleteDocument = async (id) => {
  const result = await db.query(
    'UPDATE library_documents SET deleted_at = NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id',
    [id]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  }
  try { socket.emitToAll(EVENTS.LIBRARY_DOC_DELETED, { id }); } catch (_) {}
};
