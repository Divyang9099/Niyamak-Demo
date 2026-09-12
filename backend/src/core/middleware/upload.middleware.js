const multer = require("multer");
const os     = require("os");
const fs     = require("fs");
const path   = require("path");
const { randomUUID } = require("crypto");

// Disk storage for the standard upload path. Large files (orthomosaics, point
// clouds, video) are written to a temp file and streamed to R2 by uploadToR2()
// instead of being buffered whole in RAM. uploadToR2() deletes the temp file
// after the stream completes.
const TMP_DIR = path.join(os.tmpdir(), "varuna-uploads");
try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch (_) {}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TMP_DIR),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

// Memory storage — only for tiny UI assets (logo/avatar) where buffering is fine.
const memoryStorage = multer.memoryStorage();

// ── Allowed MIME types (comprehensive drone data coverage) ────────────────────
const ALLOWED_MIME_TYPES = new Set([
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",

  // Images (RGB drone data)
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",

  // Geospatial imagery (orthomosaics, thermal)
  "image/tiff",
  "image/tif",
  "image/geo+tiff",
  "image/geotiff",

  // GIS / Map data
  "application/vnd.google-earth.kml+xml",   // KML
  "application/vnd.google-earth.kmz",        // KMZ
  "application/vnd.google-earth.kmz+xml",    // KMZ alt
  "application/xml",
  "text/xml",
  "text/plain",

  // Archive/Bundle (drone ZIP bundles, shapefiles, point clouds in ZIP)
  "application/zip",
  "application/x-zip",
  "application/x-zip-compressed",
  "application/octet-stream",               // LAS, LAZ, E57, binary formats
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/gzip",

  // Video (drone inspection footage)
  "video/mp4",
  "video/mpeg",
  "video/quicktime",                        // MOV
  "video/x-msvideo",                        // AVI
  "video/x-matroska",                       // MKV
  "video/webm",
  "video/x-ms-wmv",

  // CAD / Engineering
  "application/acad",
  "application/dxf",
  "application/x-autocad",
  "image/vnd.dxf",

  // 3D / Point Cloud formats
  "application/x-las",
  "application/x-laz",
  "application/x-e57",
  "model/obj",
  "model/gltf+json",
  "model/gltf-binary",

  // Reporting
  "application/rtf",
]);

// ── Extension whitelist (secondary guard against spoofed MIME) ────────────────
const ALLOWED_EXTENSIONS = new Set([
  // Documents
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".csv", ".rtf",
  // Images
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp",
  ".tiff", ".tif", ".geotiff",
  // GIS
  ".kml", ".kmz", ".shp", ".dbf", ".shx", ".prj", ".gpx", ".geojson",
  // Archives
  ".zip", ".7z", ".rar", ".tar", ".gz", ".tar.gz",
  // Video
  ".mp4", ".mov", ".avi", ".mkv", ".webm", ".wmv", ".mpeg", ".mpg",
  // Point cloud / 3D
  ".las", ".laz", ".e57", ".obj", ".ply", ".pts", ".xyz", ".pcd",
  // CAD
  ".dxf", ".dwg",
  // 3D model
  ".gltf", ".glb",
  // Thermal / RAW
  ".raw", ".dng", ".cr2", ".nef", ".arw",
  // XML
  ".xml",
]);

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();

  // The extension whitelist is the AUTHORITATIVE guard. MIME is advisory and
  // trivially spoofable (browsers also send application/octet-stream for many
  // binary formats), so we do NOT accept on MIME alone, and a missing/unknown
  // extension is rejected rather than waved through (closes the empty-ext hole).
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(
      Object.assign(
        new Error(
          `File type not allowed: ${file.mimetype || 'unknown'} (${ext || 'no extension'}). ` +
          "A recognised file extension is required. Accepted: PDF, Office docs, images, " +
          "video, GeoTIFF, KML/KMZ, LAS/LAZ, ZIP, CAD, and drone data formats."
        ),
        { statusCode: 400 }
      ),
      false
    );
  }
};

// ── Standard upload (used for small direct uploads ≤ 500 MB) ─────────────────
// For files larger than this, use the chunked upload API.
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB — covers reports, small orthomosaics
  },
});

// ── Unrestricted upload — for business documents (pipeline docs, pilot docs) ──
// No extension/MIME filter: users upload contracts, passports, certificates etc.
// in whatever format their scanner/phone produces (HEIC, JFIF, BMP, etc.).
const uploadAny = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

// ── Image-only filter — for logo/avatar uploads. Accepts ANY image/* mimetype
// (svg, avif, heic, ico, bmp, tiff, …), not just the document-upload extension
// whitelist above (that list is missing .svg and other image formats, since
// it was built for drone data/documents, not UI assets).
const imageFileFilter = (_req, file, cb) => {
  if (/^image\//.test(file.mimetype || '')) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error(`File must be an image (got ${file.mimetype || 'unknown type'})`), { statusCode: 400 }), false);
  }
};

// ── Tiny upload — for logo, avatar, UI assets (kept in memory) ────────────────
const uploadTiny = multer({
  storage: memoryStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

module.exports = upload;
module.exports.uploadAny = uploadAny;
module.exports.uploadTiny = uploadTiny;
module.exports.ALLOWED_MIME_TYPES = ALLOWED_MIME_TYPES;
module.exports.ALLOWED_EXTENSIONS = ALLOWED_EXTENSIONS;
