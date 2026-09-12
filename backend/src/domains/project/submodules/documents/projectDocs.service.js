const db     = require('../../../../core/config/db');
const { deleteFromR2 } = require('../../../../core/utils/r2Upload');
const socket = require('../../../../core/socket/socket.gateway');
const EVENTS = require('../../../../core/socket/socket.events');
const audit  = require('../../../audit/audit.service');
const { isRestrictedCategory, restrictedSqlFilter } = require('../../../../core/utils/docVisibility');

// UPLOAD DOCUMENT
exports.uploadDocument = async (projectId, data) => {
  const { file_name, file_key, category, uploaded_by } = data;

  // 1. Check project exists
  const project = await db.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!project.rows.length) {
    throw Object.assign(new Error('Project not found'), { statusCode: 404 });
  }

  // 2. Version control logic
  const existing = await db.query(
    `
    SELECT version FROM project_documents
    WHERE project_id = $1 AND LOWER(file_name) = LOWER($2)
    ORDER BY (substring(version FROM '[0-9]+'))::INT DESC
    LIMIT 1
    `,
    [projectId, file_name]
  );

  let version = 'v1';

  if (existing.rows.length > 0) {
    const lastVersion = (existing.rows[0].version || '').toString();
    const match = lastVersion.match(/\d+/);
    const num = (match ? parseInt(match[0], 10) : 1) + 1;
    version = `v${num}`;
  }

  // 3. Insert Document
  const query = `
    INSERT INTO project_documents
    (project_id, file_name, file_key, category, version, uploaded_by)
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *;
  `;

  const values = [
    projectId,
    file_name,
    file_key,
    category || null,
    version,
    uploaded_by || null,
  ];

  const result = await db.query(query, values);
  const doc = result.rows[0];

  // Audit + real-time broadcast so all project members see the new document immediately
  try {
    await audit.log({
      user_id:     uploaded_by,
      action:      'UPLOAD_PROJECT_DOC',
      entity_type: 'project_document',
      entity_id:   doc.id,
      new_value:   doc,
    });
  } catch (_) {}

  // The project room contains pilots too, so the broadcast carries only the id —
  // clients refetch through getDocuments(), which applies the restricted filter.
  try { socket.emitToProject(projectId, EVENTS.DOCUMENT_UPLOADED, { id: doc.id }); } catch (_) {}

  return { ...doc, is_restricted: isRestrictedCategory(doc.category) };
};

// GET DOCUMENTS
// `includeRestricted` comes from docVisibility.canViewRestrictedDocs(). When it is
// false the restricted rows are filtered out in SQL, so a pilot's response never
// carries the file name, key or id of a Commercial Document.
exports.getDocuments = async (projectId, { includeRestricted = false } = {}) => {
  const filter = restrictedSqlFilter('d.category', includeRestricted, 2);

  const result = await db.query(
    `
    SELECT d.*, u.name as uploaded_by_name
    FROM project_documents d
    LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.project_id = $1
      AND ${filter.text}
    ORDER BY d.created_at DESC
    `,
    [projectId, ...filter.params]
  );

  // Flag surviving restricted rows so the UI can badge them as pilot-hidden.
  return result.rows.map(r => ({ ...r, is_restricted: isRestrictedCategory(r.category) }));
};

// UPDATE DOCUMENT (metadata only) — scoped to its project so a member of one
// project cannot edit another project's document by guessing the docId.
exports.updateDocument = async (docId, projectId, data) => {
  const { category, file_name } = data;

  const query = `
    UPDATE project_documents
    SET
      category = COALESCE($1, category),
      file_name = COALESCE($2, file_name)
    WHERE id = $3 AND project_id = $4
    RETURNING *;
  `;

  const values = [category || null, file_name || null, docId, projectId];

  const result = await db.query(query, values);

  if (!result.rows.length) {
    throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  }

  const doc = result.rows[0];

  // Moving a document into (or out of) a restricted category changes who may see
  // it — broadcast an id-only invalidation so an open pilot tab drops the row on
  // its next refetch instead of showing a stale, now-restricted document.
  try { socket.emitToProject(projectId, EVENTS.DOCUMENT_UPDATED, { id: doc.id }); } catch (_) {}

  return { ...doc, is_restricted: isRestrictedCategory(doc.category) };
};

// DELETE DOCUMENT — scoped to its project. The lookup requires the doc to belong
// to projectId, so the R2 delete can never be aimed at another project's file.
exports.deleteDocument = async (docId, projectId) => {
  const lookup = await db.query(
    'SELECT file_key, project_id FROM project_documents WHERE id=$1 AND project_id=$2', [docId, projectId]
  );
  if (!lookup.rows.length) {
    throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  }

  const { file_key, project_id } = lookup.rows[0];
  await deleteFromR2(file_key);
  await db.query('DELETE FROM project_documents WHERE id=$1', [docId]);

  try { socket.emitToProject(project_id, EVENTS.DOCUMENT_DELETED, { id: docId }); } catch (_) {}
};
