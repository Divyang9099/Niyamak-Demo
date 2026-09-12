/**
 * R2 Multipart Upload Service
 *
 * Wraps S3-compatible multipart upload API for Cloudflare R2.
 * Supports files of any size by splitting into chunks that are uploaded
 * independently — each chunk is retried on its own without restarting the
 * whole upload.
 *
 * Flow:
 *   1. createMultipartUpload()  → { uploadId, key }
 *   2. uploadPart() × N         → { etag, partNumber }  (one per chunk)
 *   3. completeMultipartUpload() → { key, location }
 *   or
 *   3. abortMultipartUpload()   → cleanup orphaned parts
 */

const {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl }  = require('@aws-sdk/s3-request-presigner');
const { randomUUID }    = require('crypto');
const r2  = require('../config/r2');
const env = require('../config/env');

const BUCKET = () => env.r2.bucket;

// ── Sanitise filename for safe R2 key ────────────────────────────────────────
const safeKey = (folder, originalName) => {
  const path    = require('path');
  const name    = path.parse(originalName).name.replace(/[^a-zA-Z0-9-]/g, '_');
  const ext     = path.parse(originalName).ext.replace(/[^a-zA-Z0-9.-]/g, '');
  return `${folder}/${Date.now()}-${randomUUID()}-${name}${ext}`;
};

// ── 1. Initiate multipart upload ──────────────────────────────────────────────
exports.createMultipartUpload = async ({ folder, fileName, contentType }) => {
  const key = safeKey(folder, fileName);

  const cmd = new CreateMultipartUploadCommand({
    Bucket:      BUCKET(),
    Key:         key,
    ContentType: contentType || 'application/octet-stream',
  });

  const response = await r2.send(cmd);
  return { uploadId: response.UploadId, key };
};

// ── 2. Upload a single part (chunk) ──────────────────────────────────────────
// body can be a Buffer, Uint8Array, or Readable stream
exports.uploadPart = async ({ key, uploadId, partNumber, body, contentLength }) => {
  const cmd = new UploadPartCommand({
    Bucket:        BUCKET(),
    Key:           key,
    UploadId:      uploadId,
    PartNumber:    partNumber,   // 1-based, 1..10000
    Body:          body,
    ContentLength: contentLength,
  });

  const response = await r2.send(cmd);
  return { etag: response.ETag, partNumber };
};

// ── 3a. Complete multipart upload ─────────────────────────────────────────────
// parts: [{ PartNumber, ETag }]  (must be in ascending part-number order)
exports.completeMultipartUpload = async ({ key, uploadId, parts }) => {
  const sorted = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);

  const cmd = new CompleteMultipartUploadCommand({
    Bucket:          BUCKET(),
    Key:             key,
    UploadId:        uploadId,
    MultipartUpload: { Parts: sorted },
  });

  await r2.send(cmd);
  return { key };
};

// ── 3b. Abort multipart upload (cleanup on cancel) ────────────────────────────
exports.abortMultipartUpload = async ({ key, uploadId }) => {
  const cmd = new AbortMultipartUploadCommand({
    Bucket:   BUCKET(),
    Key:      key,
    UploadId: uploadId,
  });
  await r2.send(cmd);
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Get object metadata (Content-Length, Content-Type, ETag) without downloading
exports.headObject = async (key) => {
  const cmd = new HeadObjectCommand({ Bucket: BUCKET(), Key: key });
  const res = await r2.send(cmd);
  return {
    size:        res.ContentLength,
    contentType: res.ContentType,
    etag:        res.ETag,
    lastModified:res.LastModified,
  };
};

// Generate a presigned PUT URL so a client can upload a single small part
// directly to R2 without going through the backend (optional optimisation)
exports.presignPartUpload = async ({ key, uploadId, partNumber, expiresIn = 3600 }) => {
  const cmd = new UploadPartCommand({
    Bucket:     BUCKET(),
    Key:        key,
    UploadId:   uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(r2, cmd, { expiresIn });
};

// Calculate recommended chunk size based on total file size
// S3 limits: min part 5 MB (except last), max 10 000 parts, max object 5 TB
exports.recommendChunkSize = (totalBytes) => {
  const MB  = 1024 * 1024;
  const GB  = 1024 * MB;
  if (totalBytes <= 100 * MB)   return 5  * MB;   // small files  → 5 MB chunks
  if (totalBytes <= 1  * GB)    return 10 * MB;   // medium files → 10 MB chunks
  if (totalBytes <= 10 * GB)    return 50 * MB;   // large files  → 50 MB chunks
  if (totalBytes <= 100 * GB)   return 100 * MB;  // very large   → 100 MB chunks
  return 500 * MB;                                  // 200GB+       → 500 MB chunks
};
