const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const os         = require('os');
const path       = require('path');
const controller = require('./upload.controller');
const authenticate = require('../../core/middleware/auth.middleware');

router.use(authenticate);

// Write chunks to disk instead of RAM — prevents OOM on large files (50–500 MB chunks).
// Temp files are deleted by the controller after the part is relayed to R2.
const chunkUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename:    (req, file, cb) =>
      cb(null, `chunk-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 600 * 1024 * 1024 },
});

// Initiate a new multipart upload session
router.post('/initiate', controller.initiateUpload);

// Upload a single chunk (part)
// The chunk is sent as a multipart field named 'chunk' OR as a raw binary body
router.put('/:sessionId/chunk/:partNumber', chunkUpload.single('chunk'), controller.uploadChunk);

// Batch presigned PUT URLs for DIRECT-to-R2 upload (bypasses the byte relay).
// JSON body: { partNumbers: number[] }
router.post('/:sessionId/presign', controller.presignParts);

// Complete the upload — triggers post-processing queue job
router.post('/:sessionId/complete', controller.completeUpload);

// Abort / cancel upload — cleans up R2 incomplete parts
router.delete('/:sessionId', controller.abortUpload);

// Get session state — used to resume after browser refresh or disconnect
router.get('/:sessionId', controller.getSession);

module.exports = router;
