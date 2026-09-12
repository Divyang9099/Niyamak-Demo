const db = require('../../core/config/db');
const audit = require('../audit/audit.service');
const { uploadToR2, deleteFromR2 } = require('../../core/utils/r2Upload');
const { getPresignedUrl, buildDownloadFilename } = require('../../core/utils/r2Download');

// Standard checklist seeded once per lead (the user picked the "Standard set").
const DEFAULT_DOCS = [
  'Quotation',
  'Confirmation (Email / WhatsApp)',
  'Agreement',
  'Purchase Order (PO)',
  'Work Order (WO)',
];

async function ensurePipelineExists(pipelineId) {
  const r = await db.query('SELECT id FROM pipeline WHERE id = $1', [pipelineId]);
  if (!r.rows.length) throw Object.assign(new Error('Pipeline record not found'), { statusCode: 404 });
}

// Ensure all 5 default documents always exist for this lead.
// Runs on every list call — idempotent: only inserts rows that are missing.
// This means even if a default was previously deleted it will reappear on the next load.
async function ensureDefaultsExist(pipelineId) {
  const existing = await db.query(
    `SELECT name FROM pipeline_documents WHERE pipeline_id = $1 AND is_default = TRUE`,
    [pipelineId]
  );
  const existingNames = new Set(existing.rows.map(r => r.name));
  const missing = DEFAULT_DOCS.filter(name => !existingNames.has(name));
  if (!missing.length) return;
  await Promise.all(missing.map(name =>
    db.query(
      `INSERT INTO pipeline_documents (pipeline_id, name, is_default, sort_order)
       VALUES ($1, $2, TRUE, $3)`,
      [pipelineId, name, DEFAULT_DOCS.indexOf(name)]
    )
  ));
}

// LIST — returns every document slot with a presigned download URL for attached ones.
exports.listDocuments = async (pipelineId) => {
  await ensurePipelineExists(pipelineId);
  await ensureDefaultsExist(pipelineId);

  const r = await db.query(
    `SELECT d.*, u.name AS uploaded_by_name
       FROM pipeline_documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.pipeline_id = $1
      ORDER BY d.sort_order ASC, d.created_at ASC`,
    [pipelineId]
  );

  return Promise.all(r.rows.map(async (d) => {
    let url = null;
    if (d.file_key) {
      const filename = buildDownloadFilename(d.file_name || d.name, d.file_key);
      url = await getPresignedUrl(d.file_key, 3600, filename);
    }
    return { ...d, url };
  }));
};

// ADD — a custom (non-default) document slot, no file yet.
exports.addDocument = async (pipelineId, name, userId) => {
  await ensurePipelineExists(pipelineId);
  const clean = (name || '').trim();
  if (!clean) throw Object.assign(new Error('Document name is required'), { statusCode: 400 });

  const ord = await db.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM pipeline_documents WHERE pipeline_id = $1', [pipelineId]);
  const r = await db.query(
    `INSERT INTO pipeline_documents (pipeline_id, name, is_default, sort_order)
     VALUES ($1, $2, FALSE, $3) RETURNING *`,
    [pipelineId, clean, ord.rows[0].n]
  );
  const doc = r.rows[0];
  await audit.log({ user_id: userId, action: 'ADD_PIPELINE_DOCUMENT', entity_type: 'pipeline', entity_id: pipelineId, new_value: { name: clean } });
  return { ...doc, url: null };
};

// UPDATE — attach/replace a file and/or rename the slot.
exports.updateDocument = async (pipelineId, docId, { file, name }, userId) => {
  const existingRes = await db.query('SELECT * FROM pipeline_documents WHERE id = $1 AND pipeline_id = $2', [docId, pipelineId]);
  if (!existingRes.rows.length) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  const existing = existingRes.rows[0];

  const sets = [];
  const params = [];
  let newKey = null;

  if (file) {
    newKey = await uploadToR2(file, `pipeline/${pipelineId}/documents`);
    params.push(newKey);            sets.push(`file_key = $${params.length}`);
    params.push(file.originalname); sets.push(`file_name = $${params.length}`);
    params.push(file.size || null); sets.push(`file_size = $${params.length}`);
    params.push(userId || null);    sets.push(`uploaded_by = $${params.length}`);
    sets.push('uploaded_at = NOW()');
  }
  if (name !== undefined && name !== null && String(name).trim()) {
    params.push(String(name).trim());
    sets.push(`name = $${params.length}`);
  }
  if (!sets.length) return { ...existing, url: existing.file_key ? await getPresignedUrl(existing.file_key, 3600) : null };

  sets.push('updated_at = NOW()');
  params.push(docId, pipelineId);
  const r = await db.query(
    `UPDATE pipeline_documents SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND pipeline_id = $${params.length} RETURNING *`,
    params
  );
  const doc = r.rows[0];

  // Best-effort cleanup of the previous R2 object when a file is replaced.
  if (newKey && existing.file_key && existing.file_key !== newKey) {
    deleteFromR2(existing.file_key).catch(() => {});
  }

  await audit.log({
    user_id: userId,
    action: file ? 'ATTACH_PIPELINE_DOCUMENT' : 'RENAME_PIPELINE_DOCUMENT',
    entity_type: 'pipeline', entity_id: pipelineId,
    new_value: { id: docId, name: doc.name },
  });

  let url = null;
  if (doc.file_key) {
    const filename = buildDownloadFilename(doc.file_name || doc.name, doc.file_key);
    url = await getPresignedUrl(doc.file_key, 3600, filename);
  }
  return { ...doc, url };
};

// REVOKE — clears the attached file from a document slot without deleting the slot.
exports.revokeDocument = async (pipelineId, docId, userId) => {
  const r = await db.query(
    'SELECT file_key FROM pipeline_documents WHERE id = $1 AND pipeline_id = $2',
    [docId, pipelineId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  const { file_key } = r.rows[0];

  await db.query(
    `UPDATE pipeline_documents
     SET file_key = NULL, file_name = NULL, file_size = NULL, uploaded_by = NULL, uploaded_at = NULL, updated_at = NOW()
     WHERE id = $1 AND pipeline_id = $2`,
    [docId, pipelineId]
  );

  if (file_key) deleteFromR2(file_key).catch(() => {});

  await audit.log({
    user_id: userId,
    action: 'REVOKE_PIPELINE_DOCUMENT',
    entity_type: 'pipeline', entity_id: pipelineId,
    old_value: { id: docId, file_key },
  });
};

// DELETE — removes the slot and its R2 object (if any). Default documents cannot be deleted.
exports.deleteDocument = async (pipelineId, docId, userId) => {
  const check = await db.query('SELECT is_default FROM pipeline_documents WHERE id = $1 AND pipeline_id = $2', [docId, pipelineId]);
  if (!check.rows.length) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  if (check.rows[0].is_default) throw Object.assign(new Error('Default documents cannot be deleted'), { statusCode: 400 });

  const r = await db.query('DELETE FROM pipeline_documents WHERE id = $1 AND pipeline_id = $2 RETURNING file_key', [docId, pipelineId]);
  if (!r.rows.length) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  if (r.rows[0].file_key) deleteFromR2(r.rows[0].file_key).catch(() => {});
  await audit.log({ user_id: userId, action: 'DELETE_PIPELINE_DOCUMENT', entity_type: 'pipeline', entity_id: pipelineId, old_value: { id: docId } });
};
