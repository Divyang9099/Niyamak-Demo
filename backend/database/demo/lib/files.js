/**
 * Generates small, clearly-fictional demo files (PDF/PNG/KML) and uploads
 * them to the demo R2 bucket under demo/ so the "download" / "preview"
 * buttons in the UI have something real to fetch during a recording.
 *
 * Every generated document is watermarked "DEMO DATA — FICTIONAL SAMPLE"
 * so nobody could mistake it for a real certificate/report/invoice.
 */
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { createCanvas } = require('@napi-rs/canvas');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DEMO_R2_PREFIX } = require('./guard');

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

const uploaded = []; // { key } — for cleanup

async function putBuffer(key, buffer, contentType) {
  const fullKey = DEMO_R2_PREFIX + key;
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: fullKey,
    Body: buffer,
    ContentType: contentType,
  }));
  uploaded.push(fullKey);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  return { file_key: fullKey, file_size: buffer.length, checksum };
}

/** A simple, clearly-fictional PDF document. */
function makePdf({ title, lines, footer }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(9).fillColor('#b45309').text('DEMO DATA — FICTIONAL SAMPLE, NOT A REAL DOCUMENT', { align: 'right' });
    doc.moveDown(1.2);
    doc.fontSize(20).fillColor('#111827').text(title, { align: 'left' });
    doc.moveDown(0.8);
    doc.fontSize(11).fillColor('#374151');
    for (const line of lines) {
      if (line === '') { doc.moveDown(0.6); continue; }
      doc.text(line);
    }
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#9ca3af').text(footer || 'Generated for local demo/testing purposes only. SkyArc Aerial Solutions (fictional).', { align: 'left' });
    doc.end();
  });
}

/** A simple PNG "image" placeholder (aerial-survey-style colored grid) for photo/orthomosaic deliverables. */
function makePng({ title, subtitle, seedColor = '#2563eb' }) {
  const w = 900, h = 600;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  // Background gradient (stand-in for terrain/aerial tile)
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, seedColor);
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Grid lines (stand-in for orthomosaic tiling / survey grid)
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // Watermark banner
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, h - 90, w, 90);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(title, 24, h - 50);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#e5e7eb';
  ctx.fillText(subtitle || 'Demo data — fictional sample image', 24, h - 22);

  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#fde68a';
  ctx.fillText('DEMO / FICTIONAL', w - 190, 28);

  return canvas.toBuffer('image/png');
}

/** A minimal valid KML polygon (or line) for a project site boundary. */
function makeKml({ name, coordinates, kind = 'Polygon' }) {
  const coordStr = coordinates.map(([lng, lat]) => `${lng},${lat},0`).join(' ');
  const geometry = kind === 'LineString'
    ? `<LineString><tessellate>1</tessellate><coordinates>${coordStr}</coordinates></LineString>`
    : `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordStr}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name} (Demo/Fictional)</name>
    <Placemark>
      <name>${name}</name>
      <description>Fictional demo site boundary — not a real property.</description>
      ${geometry}
    </Placemark>
  </Document>
</kml>`;
  return Buffer.from(xml, 'utf8');
}

module.exports = { putBuffer, makePdf, makePng, makeKml, uploaded, r2 };
