const db = require('../../core/config/db');

exports.getVersions = async (docId) => {
  const result = await db.query(
    `SELECT lv.*, u.name AS uploaded_by_name
     FROM library_versions lv
     LEFT JOIN users u ON lv.uploaded_by = u.id
     WHERE lv.document_id = $1
     ORDER BY lv.created_at DESC`,
    [docId]
  );
  return result.rows;
};

exports.addVersion = async (docId, data) => {
  // Check if document exists
  const docCheck = await db.query('SELECT id FROM library_documents WHERE id=$1 AND deleted_at IS NULL', [docId]);
  if (!docCheck.rows.length) throw Object.assign(new Error('Document not found'), { statusCode: 404 });

  // Get latest version number for this document
  const latest = await db.query(
    "SELECT version FROM library_versions WHERE document_id=$1 ORDER BY (substring(version FROM '[0-9]+'))::INT DESC LIMIT 1",
    [docId]
  );

  let version = 'v1';
  if (latest.rows.length > 0) {
    const lastVersion = (latest.rows[0].version || '').toString();
    const match = lastVersion.match(/\d+/);
    const num = (match ? parseInt(match[0], 10) : 1) + 1;
    version = `v${num}`;
  }

  // Insert new version row with full metadata
  const result = await db.query(
    `INSERT INTO library_versions (document_id, file_key, file_name, file_size, file_type, uploaded_by, version, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      docId,
      data.file_key   || null,
      data.file_name  || null,
      data.file_size  || null,
      data.file_type  || null,
      data.uploaded_by || null,
      version,
      data.notes      || null,
    ]
  );

  // Update parent document with latest version + file metadata
  await db.query(
    `UPDATE library_documents
     SET version=$1, file_key=$2, file_name=COALESCE($3, file_name),
         file_size=COALESCE($4, file_size), file_type=COALESCE($5, file_type)
     WHERE id=$6`,
    [version, data.file_key || null, data.file_name || null, data.file_size || null, data.file_type || null, docId]
  );

  return result.rows[0];
};

/**
 * Restore an old version (M-12)
 */
exports.restoreVersion = async (docId, versionId) => {
  // 1. Fetch the old version entry
  const versionRes = await db.query('SELECT * FROM library_versions WHERE id=$1 AND document_id=$2', [versionId, docId]);
  if (!versionRes.rows.length) {
      throw Object.assign(new Error('Version history entry not found'), { statusCode: 404 });
  }
  const oldVersion = versionRes.rows[0];

  // 2. Update the parent document to point to this file_key
  await db.query(
    'UPDATE library_documents SET file_key=$1, version=$2 WHERE id=$3',
    [oldVersion.file_key, oldVersion.version, docId]
  );

  return oldVersion;
};
