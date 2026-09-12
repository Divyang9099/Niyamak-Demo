/**
 * KML / KMZ Processing Service
 *
 * Converts uploaded KML (or KMZ = zipped KML) files into GeoJSON,
 * extracts centroid coordinates, bounding box, and approximate area
 * so the project map tab can render the site boundary immediately.
 *
 * Dependencies:
 *   @tmcw/togeojson   — KML → GeoJSON conversion
 *   @xmldom/xmldom     — DOMParser polyfill for Node.js
 *   zlib / adm-zip     — KMZ extraction (KMZ is a ZIP containing doc.kml)
 */

const { DOMParser }  = require('@xmldom/xmldom');
const toGeoJSON       = require('@tmcw/togeojson');
const { Readable }    = require('stream');

// ── KMZ extraction (KMZ = ZIP containing doc.kml) ─────────────────────────────
async function extractKmlFromKmz(buffer) {
  // Use the built-in zip support via unzip — avoid heavy adm-zip dep
  // KMZ files follow the ZIP format; find the first .kml entry
  try {
    // Simple ZIP entry scan: look for Local File Header (PK\x03\x04) entries
    const view   = buffer;
    const entries = [];
    let   i       = 0;

    while (i < view.length - 30) {
      if (view[i] === 0x50 && view[i+1] === 0x4B && view[i+2] === 0x03 && view[i+3] === 0x04) {
        const fnLen   = view.readUInt16LE(i + 26);
        const extraLen= view.readUInt16LE(i + 28);
        const compSz  = view.readUInt32LE(i + 18);
        const uncomSz = view.readUInt32LE(i + 22);
        const method  = view.readUInt16LE(i + 8);
        const fnStart = i + 30;
        const fn      = view.slice(fnStart, fnStart + fnLen).toString('utf8');
        const dataStart = fnStart + fnLen + extraLen;

        if (fn.endsWith('.kml')) {
          const compressed = view.slice(dataStart, dataStart + compSz);
          if (method === 0) {
            // Stored (no compression)
            entries.push({ name: fn, data: compressed });
          } else if (method === 8) {
            // Deflate
            const zlib = require('zlib');
            const inflated = await new Promise((resolve, reject) => {
              zlib.inflateRaw(compressed, (err, result) => err ? reject(err) : resolve(result));
            });
            entries.push({ name: fn, data: inflated });
          }
        }
        i = dataStart + compSz;
      } else {
        i++;
      }
    }

    if (!entries.length) throw new Error('No .kml file found inside KMZ archive');
    // Return the first (usually doc.kml)
    return entries[0].data.toString('utf8');
  } catch (err) {
    throw Object.assign(new Error(`KMZ extraction failed: ${err.message}`), { statusCode: 400 });
  }
}

// ── Parse KML string → GeoJSON FeatureCollection ─────────────────────────────
function parseKml(kmlString) {
  const parser  = new DOMParser();
  const xmlDoc  = parser.parseFromString(kmlString, 'text/xml');

  // Check for XML parse errors
  const errors = xmlDoc.getElementsByTagName('parsererror');
  if (errors.length) {
    throw Object.assign(new Error('Invalid KML: XML parse error'), { statusCode: 400 });
  }

  const geojson = toGeoJSON.kml(xmlDoc);

  if (!geojson || geojson.type !== 'FeatureCollection') {
    throw Object.assign(new Error('KML produced no valid GeoJSON FeatureCollection'), { statusCode: 400 });
  }

  if (!geojson.features || geojson.features.length === 0) {
    throw Object.assign(new Error('KML contains no geometry features'), { statusCode: 400 });
  }

  return geojson;
}

// ── Bounding box: [minLng, minLat, maxLng, maxLat] ───────────────────────────
function bbox(geojson) {
  let minLng =  Infinity, minLat =  Infinity;
  let maxLng = -Infinity, maxLat = -Infinity;

  const processCoord = ([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  };

  const walk = (coords) => {
    if (!coords || !coords.length) return;
    if (typeof coords[0] === 'number') {
      processCoord(coords);
    } else {
      coords.forEach(walk);
    }
  };

  geojson.features.forEach(f => {
    if (!f.geometry) return;
    walk(f.geometry.coordinates);
  });

  if (!isFinite(minLng)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

// ── Centroid from bounding box midpoint ────────────────────────────────────────
function centroidFromBbox(box) {
  if (!box) return null;
  return {
    lat: (box[1] + box[3]) / 2,
    lng: (box[0] + box[2]) / 2,
  };
}

// ── Approximate polygon area in square metres (Shoelace formula) ──────────────
function polygonArea(ring) {
  let area = 0;
  const R  = 6371000; // Earth radius metres
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0] * Math.PI / 180;
    const yi = ring[i][1] * Math.PI / 180;
    const xj = ring[j][0] * Math.PI / 180;
    const yj = ring[j][1] * Math.PI / 180;
    area += (xj + xi) * (yj - yi);
  }
  return Math.abs(area * R * R / 2);
}

function totalArea(geojson) {
  let total = 0;
  geojson.features.forEach(f => {
    if (!f.geometry) return;
    const { type, coordinates } = f.geometry;
    if (type === 'Polygon') {
      total += polygonArea(coordinates[0]);
    } else if (type === 'MultiPolygon') {
      coordinates.forEach(poly => { total += polygonArea(poly[0]); });
    }
  });
  return total;
}

// ── Main export: process a KML or KMZ buffer ──────────────────────────────────
exports.processKml = async (buffer, originalName) => {
  const isKmz = (originalName || '').toLowerCase().endsWith('.kmz');

  const kmlString = isKmz
    ? await extractKmlFromKmz(buffer)
    : buffer.toString('utf8');

  const geojson  = parseKml(kmlString);
  const box      = bbox(geojson);
  const centroid = centroidFromBbox(box);
  const areaSqm  = totalArea(geojson);

  return {
    geojson,
    bbox:     box,
    center:   centroid,
    area_sqm: areaSqm,
    featureCount: geojson.features.length,
  };
};
