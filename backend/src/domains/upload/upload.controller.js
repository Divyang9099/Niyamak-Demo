const service       = require('./upload.service');
const { success }   = require('../../core/utils/response');

// POST /api/v1/uploads/initiate
exports.initiateUpload = async (req, res, next) => {
  try {
    const { entityType, projectId, fileName, fileSize, mimeType, metadata } = req.body;

    if (!entityType || !fileName) {
      return res.status(400).json({ success: false, message: 'entityType and fileName are required' });
    }

    const result = await service.initiateUpload({
      entityType,
      projectId: projectId || null,
      fileName,
      fileSize:  Number(fileSize) || 0,
      mimeType,
      userId:    req.user.id,
      userRole:  req.user.role,
      metadata:  metadata || {},
    });

    res.status(201).json(success(result, 'Upload session created', 201));
  } catch (err) { next(err); }
};

// PUT /api/v1/uploads/:sessionId/chunk/:partNumber
// Body: multipart field 'chunk' written to disk by multer (diskStorage)
exports.uploadChunk = async (req, res, next) => {
  const tempPath = req.file?.path ?? null;
  try {
    const { sessionId, partNumber } = req.params;
    const part = parseInt(partNumber, 10);

    if (!part || part < 1 || part > 10000) {
      return res.status(400).json({ success: false, message: 'Invalid partNumber (1–10000)' });
    }

    let body, contentLength;
    if (tempPath) {
      // Stream from temp file — avoids buffering the chunk in RAM
      body          = require('fs').createReadStream(tempPath);
      contentLength = req.file.size;
    } else {
      body          = req.body;
      contentLength = req.body?.length ?? 0;
    }

    if (!contentLength) {
      return res.status(400).json({ success: false, message: 'Empty chunk body' });
    }

    const result = await service.uploadChunk({
      sessionId,
      partNumber: part,
      buffer: body,
      contentLength,
      userId: req.user.id,
    });

    res.json(success(result, `Chunk ${part} uploaded`));
  } catch (err) {
    next(err);
  } finally {
    if (tempPath) {
      try { require('fs').unlinkSync(tempPath); } catch (_) {}
    }
  }
};

// POST /api/v1/uploads/:sessionId/presign  — batch presigned PUT URLs (direct-to-R2)
exports.presignParts = async (req, res, next) => {
  try {
    const result = await service.presignParts({
      sessionId:   req.params.sessionId,
      userId:      req.user.id,
      partNumbers: req.body.partNumbers,
    });
    res.json(success(result, 'Presigned part URLs'));
  } catch (err) { next(err); }
};

// POST /api/v1/uploads/:sessionId/complete
exports.completeUpload = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { entityId, extraMeta, parts } = req.body;

    const result = await service.completeUpload({
      sessionId,
      userId:    req.user.id,
      entityId:  entityId || null,
      extraMeta: extraMeta || {},
      parts:     parts || null,   // present in direct-to-R2 mode
    });

    res.json(success(result, 'Upload complete — processing queued'));
  } catch (err) { next(err); }
};

// DELETE /api/v1/uploads/:sessionId
exports.abortUpload = async (req, res, next) => {
  try {
    const result = await service.abortUpload({
      sessionId: req.params.sessionId,
      userId:    req.user.id,
    });
    res.json(success(result, 'Upload aborted'));
  } catch (err) { next(err); }
};

// GET /api/v1/uploads/:sessionId
// Allows client to resume after a disconnect by fetching already-uploaded parts
exports.getSession = async (req, res, next) => {
  try {
    const result = await service.getSession({
      sessionId: req.params.sessionId,
      userId:    req.user.id,
    });
    res.json(success(result));
  } catch (err) { next(err); }
};
