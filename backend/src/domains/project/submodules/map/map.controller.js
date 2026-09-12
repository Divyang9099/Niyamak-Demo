const service       = require('./map.service');
const { success }   = require('../../../../core/utils/response');
const kmlProcessor  = require('../../../../core/utils/kmlProcessor');
const { uploadToR2 }= require('../../../../core/utils/r2Upload');
const socket        = require('../../../../core/socket/socket.gateway');
const EVENTS        = require('../../../../core/socket/socket.events');
const db            = require('../../../../core/config/db');
const fs            = require('fs');
const { canViewRestrictedDocs, restrictedSqlFilter } = require('../../../../core/utils/docVisibility');

exports.saveMapData = async (req, res, next) => {
  try {
    const data = await service.saveMapData(req.params.id, req.body);
    const statusCode = data._created ? 201 : 200;
    delete data._created;
    res.status(statusCode).json(success(data, 'Map data saved', statusCode));
  } catch (err) { next(err); }
};

exports.getMapData = async (req, res, next) => {
  try {
    const data = await service.getMapData(req.params.id);

    // Also surface any KML/KMZ files stored in project_documents so the Map tab
    // can offer "Load on Map" for files uploaded via the Documents tab.
    // Restricted (Commercial) documents stay hidden here too — otherwise the map
    // picker would leak the file names the Documents tab deliberately filters out.
    const includeRestricted = await canViewRestrictedDocs(req.user, req.params.id);
    const filter = restrictedSqlFilter('category', includeRestricted, 2);
    const docsResult = await db.query(
      `SELECT id, file_name, file_key, created_at
       FROM project_documents
       WHERE project_id = $1
         AND (LOWER(file_name) LIKE '%.kml' OR LOWER(file_name) LIKE '%.kmz')
         AND ${filter.text}
       ORDER BY created_at DESC`,
      [req.params.id, ...filter.params]
    );

    res.json(success({ ...(data || {}), kml_documents: docsResult.rows }));
  } catch (err) { next(err); }
};

exports.deleteMapData = async (req, res, next) => {
  try {
    await service.deleteMapData(req.params.id);
    res.json(success(null, 'Map data deleted'));
  } catch (err) { next(err); }
};

/**
 * POST /api/v1/projects/:id/map/kml
 * Upload a KML or KMZ file → parse → save GeoJSON to project_maps
 * → emit real-time map update to project room.
 */
exports.uploadKml = async (req, res, next) => {
  try {
    const projectId = req.params.id;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No KML/KMZ file provided' });
    }

    const { originalname, mimetype } = req.file;
    const lower = originalname.toLowerCase();
    if (!lower.endsWith('.kml') && !lower.endsWith('.kmz')) {
      // Clean up temp file if present
      if (req.file.path) fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ success: false, message: 'File must be .kml or .kmz' });
    }

    // 1. Read file buffer — multer disk storage saves to temp file, memory storage gives buffer
    let fileBuffer;
    if (req.file.buffer) {
      fileBuffer = req.file.buffer;
    } else if (req.file.path) {
      try {
        fileBuffer = fs.readFileSync(req.file.path);
      } catch (readErr) {
        return res.status(500).json({ success: false, message: 'Failed to read uploaded file from disk' });
      }
    } else {
      return res.status(400).json({ success: false, message: 'No file buffer or path available' });
    }

    // 2. Process: parse KML → GeoJSON + centroid + bbox
    let parsed;
    try {
      parsed = await kmlProcessor.processKml(fileBuffer, originalname);
    } catch (parseErr) {
      if (req.file.path) fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ success: false, message: parseErr.message });
    }

    // 3. Store original KML in R2 for reference (uploadToR2 handles disk→stream and deletes temp file)
    let kmlKey = null;
    try {
      kmlKey = await uploadToR2(req.file, `projects/${projectId}/kml`);
    } catch (_) {
      // R2 upload failure is non-fatal — we still save the GeoJSON
      if (req.file.path) fs.promises.unlink(req.file.path).catch(() => {});
    }

    // 4a. Save to KML history log (keeps every upload)
    const kmlName = originalname.replace(/\.[^/.]+$/, ''); // strip extension
    await db.query(
      `INSERT INTO project_kml_uploads
         (project_id, name, kml_key, geojson_data, center_lat, center_lng, bbox, area_sqm, feature_count, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        projectId,
        kmlName,
        kmlKey,
        parsed.geojson ? JSON.stringify(parsed.geojson) : null,
        parsed.center?.lat || null,
        parsed.center?.lng || null,
        parsed.bbox ? JSON.stringify(parsed.bbox) : null,
        parsed.area_sqm || null,
        parsed.featureCount || 0,
        req.user?.id || null,
      ]
    );

    // 4b. Save GeoJSON + metadata to project_maps
    const mapPayload = {
      geojson_data: parsed.geojson,
      center_lat:   parsed.center?.lat  || null,
      center_lng:   parsed.center?.lng  || null,
      zoom_level:   parsed.bbox ? 13 : 12,
      kml_key:      kmlKey,
      bbox:         parsed.bbox,
      area_sqm:     parsed.area_sqm || null,
    };

    const mapData = await service.saveMapData(projectId, mapPayload);
    delete mapData._created;

    // 4. Emit real-time update so all users on the project see the new map
    try {
      socket.emitToProject(projectId, EVENTS.MAP_KML_PROCESSED, {
        projectId,
        geojson:      parsed.geojson,
        center:       parsed.center,
        bbox:         parsed.bbox,
        area_sqm:     parsed.area_sqm,
        featureCount: parsed.featureCount,
      });
    } catch (_) {}

    res.status(201).json(success({
      ...mapData,
      featureCount: parsed.featureCount,
      area_sqm:     parsed.area_sqm,
      kmlKey,
    }, 'KML processed and map updated', 201));
  } catch (err) { next(err); }
};

/**
 * POST /api/v1/projects/:id/map/import-document
 * Re-process a KML/KMZ file that already lives in project_documents.
 * Body: { doc_id }
 */
exports.importDocumentKml = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const { doc_id } = req.body;
    if (!doc_id) return res.status(400).json({ success: false, message: 'doc_id is required' });

    // Fetch document record
    const docResult = await db.query(
      'SELECT * FROM project_documents WHERE id = $1 AND project_id = $2',
      [doc_id, projectId]
    );
    if (!docResult.rows.length)
      return res.status(404).json({ success: false, message: 'Document not found' });

    const doc = docResult.rows[0];
    const lower = (doc.file_name || '').toLowerCase();
    if (!lower.endsWith('.kml') && !lower.endsWith('.kmz'))
      return res.status(400).json({ success: false, message: 'Document is not a KML/KMZ file' });

    // Stream file from R2 into a buffer
    const { getFileStream } = require('../../../../core/utils/r2Download');
    const stream = await getFileStream(doc.file_key);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    // Parse KML → GeoJSON
    let parsed;
    try {
      parsed = await kmlProcessor.processKml(buffer, doc.file_name);
    } catch (parseErr) {
      return res.status(400).json({ success: false, message: parseErr.message });
    }

    // Upsert to kml history — same (project_id, kml_key) pair must never create a
    // second row. ON CONFLICT updates in-place so re-importing the same document
    // refreshes the data without adding a duplicate layer to the map.
    const kmlName = doc.file_name.replace(/\.[^/.]+$/, '');
    await db.query(
      `INSERT INTO project_kml_uploads
         (project_id, name, kml_key, geojson_data, center_lat, center_lng, bbox, area_sqm, feature_count, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (project_id, kml_key) DO UPDATE
         SET name          = EXCLUDED.name,
             geojson_data  = EXCLUDED.geojson_data,
             center_lat    = EXCLUDED.center_lat,
             center_lng    = EXCLUDED.center_lng,
             bbox          = EXCLUDED.bbox,
             area_sqm      = EXCLUDED.area_sqm,
             feature_count = EXCLUDED.feature_count,
             uploaded_by   = EXCLUDED.uploaded_by,
             created_at    = NOW()`,
      [
        projectId, kmlName, doc.file_key,
        parsed.geojson ? JSON.stringify(parsed.geojson) : null,
        parsed.center?.lat || null, parsed.center?.lng || null,
        parsed.bbox ? JSON.stringify(parsed.bbox) : null,
        parsed.area_sqm || null, parsed.featureCount || 0, req.user?.id || null,
      ]
    );

    // Upsert project_maps
    const mapPayload = {
      geojson_data: parsed.geojson,
      center_lat:   parsed.center?.lat || null,
      center_lng:   parsed.center?.lng || null,
      zoom_level:   13,
      kml_key:      doc.file_key,
      bbox:         parsed.bbox,
      area_sqm:     parsed.area_sqm || null,
    };
    const mapData = await service.saveMapData(projectId, mapPayload);
    delete mapData._created;

    try {
      socket.emitToProject(projectId, EVENTS.MAP_KML_PROCESSED, {
        projectId,
        geojson:      parsed.geojson,
        center:       parsed.center,
        bbox:         parsed.bbox,
        area_sqm:     parsed.area_sqm,
        featureCount: parsed.featureCount,
      });
    } catch (_) {}

    res.status(201).json(success({
      ...mapData,
      featureCount: parsed.featureCount,
      area_sqm:     parsed.area_sqm,
    }, 'KML imported from document and map updated', 201));
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/projects/:id/map/kml-history
 * Returns all KML uploads for a project ordered newest first.
 */
exports.getKmlHistory = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT k.id, k.name, k.kml_key, k.center_lat, k.center_lng, k.bbox, k.area_sqm, k.feature_count,
              k.geojson_data, k.created_at,
              u.name AS uploaded_by_name
       FROM project_kml_uploads k
       LEFT JOIN users u ON k.uploaded_by = u.id
       WHERE k.project_id = $1
       ORDER BY k.created_at DESC`,
      [req.params.id]
    );
    res.json(success(result.rows));
  } catch (err) { next(err); }
};
