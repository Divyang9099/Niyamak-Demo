const fs      = require('fs');
const service = require('./projectDocs.service');
const { success, error } = require('../../../../core/utils/response');
const db = require('../../../../core/config/db');
const { uploadToR2 } = require('../../../../core/utils/r2Upload');
const { getFileStream, streamDownload } = require('../../../../core/utils/r2Download');
const { isRestrictedCategory, canViewRestrictedDocs } = require('../../../../core/utils/docVisibility');

// Fire-and-forget: process a KML/KMZ doc into the project map.
// Runs after the HTTP response is sent — failures never break the upload.
async function _autoProcessKml(projectId, buffer, originalname, docKey, userId) {
  try {
    const kmlProcessor = require('../../../../core/utils/kmlProcessor');
    const mapService   = require('../map/map.service');
    const socket       = require('../../../../core/socket/socket.gateway');
    const EVENTS       = require('../../../../core/socket/socket.events');

    const parsed = await kmlProcessor.processKml(buffer, originalname);

    await mapService.saveMapData(projectId, {
      geojson_data: parsed.geojson,
      center_lat:   parsed.center?.lat  || null,
      center_lng:   parsed.center?.lng  || null,
      zoom_level:   13,
      kml_key:      docKey,
      bbox:         parsed.bbox,
      area_sqm:     parsed.area_sqm || null,
    });

    const kmlName = originalname.replace(/\.[^/.]+$/, '');
    await db.query(
      `INSERT INTO project_kml_uploads
         (project_id, name, kml_key, geojson_data, center_lat, center_lng, bbox, area_sqm, feature_count, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        projectId, kmlName, docKey,
        parsed.geojson ? JSON.stringify(parsed.geojson) : null,
        parsed.center?.lat || null, parsed.center?.lng || null,
        parsed.bbox ? JSON.stringify(parsed.bbox) : null,
        parsed.area_sqm || null, parsed.featureCount || 0, userId,
      ]
    );

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
  } catch (err) {
    console.error('[Map] KML auto-process from document failed:', err.message);
  }
}

exports.uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json(error('No file provided', 400));

    // Capture buffer for KML processing BEFORE uploadToR2 deletes the temp file
    const lower = req.file.originalname.toLowerCase();
    const isKml = lower.endsWith('.kml') || lower.endsWith('.kmz');
    let kmlBuffer = null;
    if (isKml) {
      kmlBuffer = req.file.buffer
        ? req.file.buffer
        : (req.file.path ? fs.readFileSync(req.file.path) : null);
    }

    const key = await uploadToR2(req.file, "documents");

    const data = await service.uploadDocument(req.params.id, {
      ...req.body,
      file_name: req.file.originalname,
      file_key: key,
      uploaded_by: req.user.id
    });
    res.status(201).json(success(data, 'Document uploaded securely', 201));

    // Auto-populate map if this is a KML/KMZ (non-blocking)
    if (isKml && kmlBuffer) {
      _autoProcessKml(req.params.id, kmlBuffer, req.file.originalname, key, req.user.id);
    }
  } catch (err) { next(err); }
};

exports.getDocuments = async (req, res, next) => {
  try {
    // Commercial (restricted) documents are stripped server-side for anyone who
    // is not an admin or a PM on this project — pilots never receive the rows.
    const includeRestricted = await canViewRestrictedDocs(req.user, req.params.id);
    const data = await service.getDocuments(req.params.id, { includeRestricted });
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.updateDocument = async (req, res, next) => {
  try {
    // Scope by project so a PM on project A can't edit project B's document.
    const data = await service.updateDocument(req.params.docId, req.params.id, req.body);
    res.json(success(data, 'Document updated'));
  } catch (err) { next(err); }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    // Scope by project so the delete (which also removes the R2 object) can only
    // touch a document that actually belongs to the project in the URL.
    await service.deleteDocument(req.params.docId, req.params.id);
    res.json(success(null, 'Document deleted'));
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/projects/:id/documents/:docId/download
 * Secure file download — checks JWT + project membership before serving file URL.
 * Admins bypass membership check. Pilots/PMs must be assigned to the project.
 */
exports.downloadDocument = async (req, res, next) => {
  try {
    const { id: projectId, docId } = req.params;
    const requestingUser = req.user;

    // 1. Admin bypasses membership check
    if (requestingUser.role !== 'admin') {
      const membership = await db.query(
        'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
        [projectId, requestingUser.id]
      );
      if (!membership.rows.length) {
        return res.status(403).json(error('Access denied. You are not a member of this project.', 403));
      }
    }

    // 2. Fetch the document record
    const docResult = await db.query(
      'SELECT * FROM project_documents WHERE id = $1 AND project_id = $2',
      [docId, projectId]
    );
    if (!docResult.rows.length) {
      return res.status(404).json(error('Document not found', 404));
    }

    const doc = docResult.rows[0];

    // 2b. Restricted category (Commercial Documents) — admins and the project's
    // PMs only. Blocks a pilot who kept a stale list, or guessed a docId, from
    // pulling the file after the category was changed.
    if (isRestrictedCategory(doc.category) &&
        !(await canViewRestrictedDocs(requestingUser, projectId))) {
      return res.status(403).json(error(
        'This document is restricted. Only admins and project managers can access it.', 403
      ));
    }

    // 3. Log the download in audit log
    await db.query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id)
       VALUES ($1, 'DOWNLOAD', 'project_document', $2)`,
      [requestingUser.id, docId]
    );

    // 4. Stream from R2
    const r2Key = doc.file_key;
    if (!r2Key) {
      return res.status(404).json(error('File not found — upload may have failed', 404));
    }

    // Stream in original form — real MIME type + original filename/extension.
    await streamDownload(res, r2Key, doc.file_name || doc.name || 'document', next);
  } catch (err) { next(err); }
};

