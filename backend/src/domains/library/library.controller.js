const service         = require('./library.service');
const categoryService = require('./category.service');
const versionService  = require('./version.service');
const { success, error } = require('../../core/utils/response');
const { uploadToR2 } = require('../../core/utils/r2Upload');
const { getFileStream, getPresignedUrl, buildDownloadFilename } = require('../../core/utils/r2Download');
const db = require('../../core/config/db');
const archiver = require('archiver');

// Library confidentiality: documents carry access_level 'all' | 'admin_only'.
// The listing (service.getDocuments) hides admin_only rows from non-admins, so
// every direct-by-id endpoint that hands out a file or presigned URL MUST apply
// the same rule or it becomes a bypass. admin + super_admin are full-access
// (mirrors role.middleware's super_admin→admin elevation).
const isLibraryAdmin = (req) => ['admin', 'super_admin'].includes(req.user?.role);
const canAccessDoc   = (accessLevel, req) => isLibraryAdmin(req) || accessLevel === 'all';

// ─── CATEGORIES ──────────────────────────────

exports.getCategories = async (req, res, next) => {
  try {
    res.json(success(await categoryService.getCategories()));
  } catch (err) { next(err); }
};

exports.createCategory = async (req, res, next) => {
  try {
    res.status(201).json(success(await categoryService.createCategory(req.body), 'Category created', 201));
  } catch (err) { next(err); }
};

exports.updateCategory = async (req, res, next) => {
  try {
    res.json(success(await categoryService.updateCategory(req.params.id, req.body), 'Category updated'));
  } catch (err) { next(err); }
};

exports.deleteCategory = async (req, res, next) => {
  try {
    await categoryService.deleteCategory(req.params.id);
    res.json(success(null, 'Category deleted'));
  } catch (err) { next(err); }
};

// ─── DOCUMENTS ───────────────────────────────

exports.getDocuments = async (req, res, next) => {
  try {
    res.json(success(await service.getDocuments(req.query, req.user.role)));
  } catch (err) { next(err); }
};

exports.createDocument = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json(error('No file provided', 400));
    const key = await uploadToR2(req.file, "library");

    const data = await service.createDocument({
      ...req.body,
      file_name: req.file.originalname,
      file_key:  key,
      file_size: req.file.size,
      file_type: req.file.mimetype,
    }, req.user.id);
    res.status(201).json(success(data, 'Document uploaded', 201));
  } catch (err) { next(err); }
};

exports.updateDocument = async (req, res, next) => {
  try {
    res.json(success(await service.updateDocument(req.params.id, req.body), 'Document updated'));
  } catch (err) { next(err); }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    await service.deleteDocument(req.params.id);
    res.json(success(null, 'Document deleted'));
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/library/documents/:id/download[?version_id=uuid]
 * Returns a short-lived presigned URL so the browser downloads directly from R2.
 */
exports.downloadDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { version_id } = req.query;

    let r2Key, fileName;

    if (version_id) {
      const vResult = await db.query(
        `SELECT lv.file_key, ld.file_name, ld.access_level
         FROM library_versions lv
         JOIN library_documents ld ON lv.document_id = ld.id
         WHERE lv.id = $1 AND lv.document_id = $2`,
        [version_id, id]
      );
      if (!vResult.rows.length) return res.status(404).json(error('Version not found', 404));
      // 404 (not 403) for restricted docs so we don't confirm the id exists.
      if (!canAccessDoc(vResult.rows[0].access_level, req)) return res.status(404).json(error('Version not found', 404));
      r2Key    = vResult.rows[0].file_key;
      fileName = vResult.rows[0].file_name || 'document';
    } else {
      const dResult = await db.query(
        'SELECT * FROM library_documents WHERE id = $1 AND deleted_at IS NULL',
        [id]
      );
      if (!dResult.rows.length) return res.status(404).json(error('Document not found', 404));
      const doc = dResult.rows[0];
      if (!canAccessDoc(doc.access_level, req)) return res.status(404).json(error('Document not found', 404));
      r2Key    = doc.file_key;
      fileName = doc.file_name || doc.name || 'document';
    }

    if (!r2Key) return res.status(404).json(error('File not found — upload may have failed', 404));

    await db.query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id)
       VALUES ($1, 'DOWNLOAD', 'library_document', $2)`,
      [req.user.id, id]
    );

    const downloadName = buildDownloadFilename(fileName, r2Key);
    const url = await getPresignedUrl(r2Key, 300, downloadName);
    res.json(success({ url, file_name: downloadName }));
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/library/documents/:id/preview
 * Returns a short-lived presigned URL for in-browser preview (PDF, images, etc.)
 */
exports.previewDocument = async (req, res, next) => {
  try {
    const dResult = await db.query(
      'SELECT file_key, file_name, file_type, access_level FROM library_documents WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!dResult.rows.length) return res.status(404).json(error('Document not found', 404));

    const doc = dResult.rows[0];
    if (!canAccessDoc(doc.access_level, req)) return res.status(404).json(error('Document not found', 404));
    if (!doc.file_key) return res.status(404).json(error('File not found', 404));

    const url = await getPresignedUrl(doc.file_key, 900); // 15-minute window
    res.json(success({ url, file_name: doc.file_name, file_type: doc.file_type }));
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/library/categories/:id/download
 * Streams a ZIP of every (non-deleted) document in the category, named after the category.
 * Uses archiver in `zip` mode and streams to the response — no buffering of full ZIP in memory.
 */
exports.downloadCategoryZip = async (req, res, next) => {
  try {
    const { id } = req.params;

    const catResult = await db.query(
      'SELECT id, name FROM library_categories WHERE id = $1',
      [id]
    );
    if (!catResult.rows.length) {
      return res.status(404).json(error('Category not found', 404));
    }
    const category = catResult.rows[0];

    // Non-admins only get 'all' documents in the zip — never admin_only files.
    const docsResult = await db.query(
      `SELECT id, name, file_name, file_key
         FROM library_documents
        WHERE category_id = $1
          AND deleted_at IS NULL
          AND file_key IS NOT NULL
          ${isLibraryAdmin(req) ? '' : "AND access_level = 'all'"}`,
      [id]
    );
    const docs = docsResult.rows;
    if (docs.length === 0) {
      return res.status(404).json(error('No downloadable documents in this category', 404));
    }

    const safeCatName = category.name.replace(/[^a-zA-Z0-9 _-]/g, '_').trim() || 'category';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeCatName}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (w) => { if (w.code !== 'ENOENT') console.warn('[zip warn]', w.message); });
    archive.on('error', (e) => {
      console.error('[zip error]', e.message);
      if (!res.headersSent) next(e); else res.destroy();
    });
    archive.pipe(res);

    // Track names to avoid collisions inside the zip
    const used = new Map();
    for (const doc of docs) {
      try {
        const stream = await getFileStream(doc.file_key);
        const baseName = buildDownloadFilename(doc.file_name || doc.name, doc.file_key, `${doc.id}.bin`);
        let nameInZip = baseName;
        const count = used.get(baseName) || 0;
        if (count > 0) {
          const dot = nameInZip.lastIndexOf('.');
          nameInZip = dot > 0
            ? `${nameInZip.slice(0, dot)} (${count})${nameInZip.slice(dot)}`
            : `${nameInZip} (${count})`;
        }
        used.set(baseName, count + 1);
        archive.append(stream, { name: nameInZip });
      } catch (e) {
        console.warn(`[zip] skipping ${doc.id} (${doc.file_name}):`, e.message);
        // skip missing/unreadable file rather than failing the whole zip
      }
    }

    // Audit log — single entry per category download
    await db.query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id)
       VALUES ($1, 'DOWNLOAD_CATEGORY_ZIP', 'library_category', $2)`,
      [req.user.id, category.id]
    );

    await archive.finalize();
  } catch (err) { next(err); }
};

// ─── VERSIONS ────────────────────────────────

exports.getVersions = async (req, res, next) => {
  try {
    // Version rows expose file_key etc. — gate them by the parent doc's access_level
    // so a non-admin can't enumerate/download versions of an admin_only document.
    const parent = await db.query(
      'SELECT access_level FROM library_documents WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!parent.rows.length) return res.status(404).json(error('Document not found', 404));
    if (!canAccessDoc(parent.rows[0].access_level, req)) return res.status(404).json(error('Document not found', 404));
    res.json(success(await versionService.getVersions(req.params.id)));
  } catch (err) { next(err); }
};

exports.addVersion = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json(error('No file provided for version', 400));
    const key = await uploadToR2(req.file, "library");

    const data = await versionService.addVersion(req.params.id, {
      ...req.body,
      file_key:    key,
      file_name:   req.file.originalname,
      file_size:   req.file.size,
      file_type:   req.file.mimetype,
      uploaded_by: req.user.id,
    });
    res.status(201).json(success(data, 'New version added', 201));
  } catch (err) { next(err); }
};

exports.restoreVersion = async (req, res, next) => {
  try {
    const { id: docId, versionId } = req.params;
    const data = await versionService.restoreVersion(docId, versionId);
    res.json(success(data, 'Document restored to previous version'));
  } catch (err) { next(err); }
};

exports.archiveDocument = async (req, res, next) => {
  try {
    await service.archiveDocument(req.params.id, req.user.id);
    res.json(success(null, 'Document archived successfully'));
  } catch (err) { next(err); }
};
