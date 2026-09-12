const db = require('../../../../core/config/db');

exports.saveMapData = async (projectId, mapData) => {
  const projCheck = await db.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!projCheck.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

  // Upsert — avoids race-condition between SELECT+INSERT and handles duplicate project_maps rows
  const result = await db.query(
    `INSERT INTO project_maps
       (project_id, geojson_data, center_lat, center_lng, zoom_level, kml_key, bbox, area_sqm)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (project_id) DO UPDATE SET
       geojson_data = EXCLUDED.geojson_data,
       center_lat   = EXCLUDED.center_lat,
       center_lng   = EXCLUDED.center_lng,
       zoom_level   = EXCLUDED.zoom_level,
       kml_key      = COALESCE(EXCLUDED.kml_key,  project_maps.kml_key),
       bbox         = COALESCE(EXCLUDED.bbox,      project_maps.bbox),
       area_sqm     = COALESCE(EXCLUDED.area_sqm,  project_maps.area_sqm)
     RETURNING *`,
    [
      projectId,
      mapData.geojson_data ? JSON.stringify(mapData.geojson_data) : null,
      mapData.center_lat  ?? null,
      mapData.center_lng  ?? null,
      mapData.zoom_level  ?? 12,
      mapData.kml_key     ?? null,
      mapData.bbox        ? JSON.stringify(mapData.bbox) : null,
      mapData.area_sqm    ?? null,
    ]
  );
  return result.rows[0];
};

exports.getMapData = async (projectId) => {
  const result = await db.query('SELECT * FROM project_maps WHERE project_id = $1', [projectId]);
  if (!result.rows.length) return null;
  return result.rows[0];
};

exports.deleteMapData = async (projectId) => {
  await db.query('DELETE FROM project_maps WHERE project_id = $1', [projectId]);
};
