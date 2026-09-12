const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const path = require("path");
const r2 = require("../config/r2");
const env = require("../config/env");

exports.getFileStream = async (key) => {
  if (!key) throw new Error("No file key provided for download");

  const command = new GetObjectCommand({
    Bucket: env.r2.bucket,
    Key: key,
  });

  const response = await r2.send(command).catch(err => {
    throw new Error(`Failed to fetch from R2: ${err.message}`);
  });

  return response.Body;
};

/**
 * Fetch the full R2 object — Body stream PLUS metadata (ContentType, ContentLength).
 * Use this for downloads so the browser gets the real MIME type and size.
 */
exports.getFileObject = async (key) => {
  if (!key) throw new Error("No file key provided for download");
  const command = new GetObjectCommand({ Bucket: env.r2.bucket, Key: key });
  return r2.send(command).catch(err => {
    throw new Error(`Failed to fetch from R2: ${err.message}`);
  });
};

/**
 * Build a correct download filename: a human display name carrying the ORIGINAL
 * file extension. The extension is always preserved inside the R2 key (see
 * buildKey in r2Upload), so we recover it from there when the display name lacks
 * one. This stops files downloading as "name.txt" / extension-less blobs.
 */
exports.buildDownloadFilename = (displayName, key, fallback = "download") => {
  const keyExt = path.extname(key || "");                 // e.g. ".pdf"
  let base = (displayName || "").trim();
  if (!base) base = path.basename(key || "") || fallback; // fall back to original key name
  const baseExt = path.extname(base);
  // Append the real extension when the display name has none, or a different one.
  if (keyExt && baseExt.toLowerCase() !== keyExt.toLowerCase()) {
    base = base + keyExt;
  }
  return base.replace(/[\r\n"\\/]/g, "_");                 // sanitize for the header
};

/**
 * One-call streamed download: pulls the object from R2, sets the real Content-Type,
 * Content-Length and a Content-Disposition with the correct original filename, then
 * pipes to the response. Centralizes "download in original form" for every endpoint.
 */
exports.streamDownload = async (res, key, displayName, next) => {
  const obj = await exports.getFileObject(key);
  const filename = exports.buildDownloadFilename(displayName, key);
  res.setHeader("Content-Type", obj.ContentType || "application/octet-stream");
  if (obj.ContentLength != null) res.setHeader("Content-Length", obj.ContentLength);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  obj.Body
    .on("error", (streamErr) => {
      if (!res.headersSent) (next ? next(streamErr) : res.destroy());
      else res.destroy();
    })
    .pipe(res);
};

exports.getPresignedUrl = async (key, expiresIn = 3600, downloadFilename = null) => {
  if (!key) throw new Error("No file key provided for presigned URL");

  const params = { Bucket: env.r2.bucket, Key: key };
  if (downloadFilename) {
    params.ResponseContentDisposition = `attachment; filename="${downloadFilename.replace(/"/g, '')}"`;
  }

  const command = new GetObjectCommand(params);
  return getSignedUrl(r2, command, { expiresIn });
};
