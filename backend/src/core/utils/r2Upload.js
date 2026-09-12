const { PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { randomUUID } = require("crypto");
const fs   = require("fs");
const path = require("path");
const r2  = require("../config/r2");
const env = require("../config/env");

// Below this size we read the temp file into memory and do ONE PutObjectCommand
// with a known Content-Length. A single signed PUT is fast and reliable. Streaming
// a body of UNKNOWN length forces the SDK into aws-chunked streaming-signature
// mode, which R2 handles slowly and can reset mid-transfer (ECONNRESET / 60s+
// stalls). Only genuinely large files fall back to the multipart streaming path.
const BUFFER_THRESHOLD = 100 * 1024 * 1024; // 100 MB

const buildKey = (file, folder) => {
  const safeName = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9-]/g, '_');
  const safeExt  = path.parse(file.originalname).ext.replace(/[^a-zA-Z0-9.-]/g, '');
  return `${folder}/${Date.now()}-${randomUUID()}-${safeName}${safeExt}`;
};

/**
 * Upload a multer file to R2.
 *
 * Handles BOTH storage engines:
 *   • memoryStorage (file.buffer)  — tiny assets (logo/avatar). Single PUT.
 *   • diskStorage   (file.path)    — everything else. Files up to BUFFER_THRESHOLD
 *                                    are read into a Buffer and PUT in one signed
 *                                    request (known length = fast). Larger files
 *                                    stream via a multipart Upload. The temp file
 *                                    is removed afterwards either way.
 */
exports.uploadToR2 = async (file, folder = "general") => {
  if (!file || (!file.buffer && !file.path)) {
    throw new Error("No file buffer or path provided to R2 uploader");
  }

  const key = buildKey(file, folder);

  // ── In-memory path (tiny uploads) ──────────────────────────────────────────
  if (file.buffer) {
    await r2.send(new PutObjectCommand({
      Bucket:        env.r2.bucket,
      Key:           key,
      Body:          file.buffer,
      ContentType:   file.mimetype,
      ContentLength: file.buffer.length,
    }));
    return key;
  }

  // ── On-disk path ───────────────────────────────────────────────────────────
  let size = file.size;
  if (size == null) {
    try { size = (await fs.promises.stat(file.path)).size; } catch { size = 0; }
  }

  try {
    // Fast path — single PUT with a known Content-Length.
    if (size <= BUFFER_THRESHOLD) {
      const body = await fs.promises.readFile(file.path);
      await r2.send(new PutObjectCommand({
        Bucket:        env.r2.bucket,
        Key:           key,
        Body:          body,
        ContentType:   file.mimetype,
        ContentLength: body.length,
      }));
      return key;
    }

    // Large-file path — stream in parts so we never hold the whole file in RAM.
    const stream = fs.createReadStream(file.path);
    try {
      const uploader = new Upload({
        client: r2,
        params: {
          Bucket:      env.r2.bucket,
          Key:         key,
          Body:        stream,
          ContentType: file.mimetype,
        },
        queueSize:      4,                 // parallel parts
        partSize:       10 * 1024 * 1024,  // 10 MB parts
        leavePartsOnError: false,
      });
      await uploader.done();
      return key;
    } finally {
      stream.destroy();
    }
  } finally {
    // Always remove the temp file.
    fs.promises.unlink(file.path).catch(() => {});
  }
};

exports.deleteFromR2 = async (key) => {
  if (!key) return;
  await r2.send(new DeleteObjectCommand({
    Bucket: env.r2.bucket,
    Key:    key,
  }));
};
