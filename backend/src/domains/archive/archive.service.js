const db = require('../../core/config/db');

/**
 * Returns all archived entities across all domains, newest first.
 * Each row is normalised to a common shape:
 *   { entity_type, entity_id, name, description, archived_at, archived_by_name, metadata }
 */
exports.getArchived = async ({ search = '', type = 'all', page = 1, limit = 50 } = {}) => {
  const offset = (Math.max(Number(page), 1) - 1) * Math.min(Number(limit), 200);
  const items = [];

  // ── Library Documents ─────────────────────────────────────────────────
  if (type === 'all' || type === 'library_document') {
    const q = `
      SELECT
        'library_document'          AS entity_type,
        ld.id                       AS entity_id,
        COALESCE(ld.file_name, ld.name, 'Untitled') AS name,
        ld.description,
        ld.archived_at,
        ab.name                     AS archived_by_name,
        ld.file_size,
        ld.file_type,
        ld.version,
        c.name                      AS category_name,
        f.name                      AS folder_name
      FROM library_documents ld
      LEFT JOIN users ab       ON ld.archived_by = ab.id
      LEFT JOIN library_categories c ON ld.category_id = c.id
      LEFT JOIN library_folders    f ON ld.folder_id   = f.id
      WHERE ld.archived_at IS NOT NULL
        AND ld.deleted_at   IS NULL
        ${search ? `AND (ld.file_name ILIKE $1 OR ld.name ILIKE $1 OR ld.description ILIKE $1)` : ''}
      ORDER BY ld.archived_at DESC
    `;
    const params = search ? [`%${search}%`] : [];
    const rows = (await db.query(q, params)).rows;
    items.push(...rows.map(r => ({
      entity_type:      r.entity_type,
      entity_id:        r.entity_id,
      name:             r.name,
      description:      r.description || null,
      archived_at:      r.archived_at,
      archived_by_name: r.archived_by_name || null,
      metadata: {
        file_size:     r.file_size,
        file_type:     r.file_type,
        version:       r.version,
        category_name: r.category_name,
        folder_name:   r.folder_name,
      },
    })));
  }

  // ── Projects ──────────────────────────────────────────────────────────
  if (type === 'all' || type === 'project') {
    const q = `
      SELECT
        'project'     AS entity_type,
        p.id          AS entity_id,
        p.name,
        p.description,
        COALESCE(p.archived_at, p.updated_at) AS archived_at,
        ab.name       AS archived_by_name,
        p.status,
        p.project_type,
        p.location_name
      FROM projects p
      LEFT JOIN users ab ON p.archived_by = ab.id
      WHERE (p.status IN ('cancelled', 'complete') OR p.archived_at IS NOT NULL)
        AND p.deleted_at IS NULL
        ${search ? `AND (p.name ILIKE $1 OR p.description ILIKE $1 OR p.location_name ILIKE $1)` : ''}
      ORDER BY COALESCE(p.archived_at, p.updated_at) DESC
    `;
    const params = search ? [`%${search}%`] : [];
    const rows = (await db.query(q, params)).rows;
    items.push(...rows.map(r => ({
      entity_type:      r.entity_type,
      entity_id:        r.entity_id,
      name:             r.name,
      description:      r.description || null,
      archived_at:      r.archived_at,
      archived_by_name: r.archived_by_name || null,
      metadata: {
        status:       r.status,
        project_type: r.project_type,
        location:     r.location_name,
      },
    })));
  }

  // ── Pipelines (cancelled or converted) ───────────────────────────────
  if (type === 'all' || type === 'pipeline') {
    const q = `
      SELECT
        'pipeline'   AS entity_type,
        p.id         AS entity_id,
        p.name,
        p.notes      AS description,
        COALESCE(p.updated_at, p.created_at) AS archived_at,
        p.stage,
        p.cancel_reason,
        p.converted_project_id,
        pr.name      AS converted_project_name,
        p.client_name,
        p.project_type,
        p.estimated_value,
        CASE WHEN p.converted_project_id IS NOT NULL THEN 'converted' ELSE 'cancelled' END AS outcome
      FROM pipeline p
      LEFT JOIN projects pr ON pr.id = p.converted_project_id
      WHERE (p.stage = 'cancelled' OR p.converted_project_id IS NOT NULL)
        ${search ? `AND (p.name ILIKE $1 OR p.client_name ILIKE $1 OR p.cancel_reason ILIKE $1)` : ''}
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC
    `;
    const params = search ? [`%${search}%`] : [];
    const rows = (await db.query(q, params)).rows;
    items.push(...rows.map(r => ({
      entity_type:      r.entity_type,
      entity_id:        r.entity_id,
      name:             r.name,
      description:      r.description || null,
      archived_at:      r.archived_at,
      archived_by_name: null,
      metadata: {
        outcome:                  r.outcome,
        cancel_reason:            r.cancel_reason || null,
        converted_project_id:     r.converted_project_id || null,
        converted_project_name:   r.converted_project_name || null,
        client_name:              r.client_name || null,
        project_type:             r.project_type || null,
        estimated_value:          r.estimated_value || null,
      },
    })));
  }

  // Sort combined list by archived_at desc, then paginate
  items.sort((a, b) => new Date(b.archived_at) - new Date(a.archived_at));

  const total = items.length;
  return {
    items:  items.slice(offset, offset + Number(limit)),
    total,
    page:   Number(page),
    limit:  Number(limit),
  };
};

/**
 * Restore an archived entity back to its active state.
 */
exports.restore = async (entityType, entityId, userId) => {
  switch (entityType) {
    case 'library_document': {
      const result = await db.query(
        `UPDATE library_documents
         SET archived_at = NULL, archived_by = NULL
         WHERE id = $1 AND archived_at IS NOT NULL AND deleted_at IS NULL
         RETURNING id, COALESCE(file_name, name, 'Untitled') AS name`,
        [entityId]
      );
      if (!result.rows.length) throw Object.assign(new Error('Document not found or not archived'), { statusCode: 404 });

      await db.query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id)
         VALUES ($1, 'RESTORE_FROM_ARCHIVE', 'library_document', $2)`,
        [userId, entityId]
      );
      return result.rows[0];
    }

    case 'project': {
      // Archiving no longer changes status — it only sets archived_at.
      // On restore: clear archived_at and keep the original status, EXCEPT for
      // cancelled projects (a terminal status) which are reset to 'initiate' so
      // they re-enter the active lifecycle.
      const result = await db.query(
        `UPDATE projects
         SET status      = CASE WHEN status = 'cancelled' THEN 'initiate' ELSE status END,
             archived_at = NULL,
             archived_by = NULL,
             updated_at  = NOW()
         WHERE id = $1 AND (status IN ('cancelled', 'complete') OR archived_at IS NOT NULL) AND deleted_at IS NULL
         RETURNING id, name, status`,
        [entityId]
      );
      if (!result.rows.length) throw Object.assign(new Error('Project not found or not archived'), { statusCode: 404 });

      await db.query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id)
         VALUES ($1, 'RESTORE_FROM_ARCHIVE', 'project', $2)`,
        [userId, entityId]
      );
      return result.rows[0];
    }

    case 'pipeline': {
      // Only cancelled pipelines can be restored (converted ones already have a live project).
      const result = await db.query(
        `UPDATE pipeline
         SET stage = 'inquiry', cancel_reason = NULL, updated_at = NOW()
         WHERE id = $1 AND stage = 'cancelled' AND converted_project_id IS NULL
         RETURNING id, name`,
        [entityId]
      );
      if (!result.rows.length) throw Object.assign(new Error('Pipeline not found, not cancelled, or already converted'), { statusCode: 404 });

      await db.query(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id)
         VALUES ($1, 'RESTORE_FROM_ARCHIVE', 'pipeline', $2)`,
        [userId, entityId]
      );
      return result.rows[0];
    }

    default:
      throw Object.assign(new Error(`Unknown entity type: ${entityType}`), { statusCode: 400 });
  }
};

/**
 * Hard-delete (permanently remove) an archived entity.
 */
exports.permanentDelete = async (entityType, entityId) => {
  switch (entityType) {
    case 'library_document': {
      const result = await db.query(
        `UPDATE library_documents SET deleted_at = NOW()
         WHERE id = $1 AND archived_at IS NOT NULL RETURNING id`,
        [entityId]
      );
      if (!result.rows.length) throw Object.assign(new Error('Document not found or not archived'), { statusCode: 404 });
      return result.rows[0];
    }
    case 'project': {
      const result = await db.query(
        `UPDATE projects SET deleted_at = NOW()
         WHERE id = $1 AND (status IN ('cancelled', 'complete') OR archived_at IS NOT NULL) RETURNING id`,
        [entityId]
      );
      if (!result.rows.length) throw Object.assign(new Error('Project not found or not archived'), { statusCode: 404 });
      return result.rows[0];
    }
    case 'pipeline': {
      // Clear the back-link on any linked project so the FK doesn't block the delete.
      await db.query('UPDATE projects SET source_pipeline_id = NULL WHERE source_pipeline_id = $1', [entityId]);

      // Clean up R2 documents best-effort.
      try {
        const docs = await db.query(
          'SELECT file_key FROM pipeline_documents WHERE pipeline_id = $1 AND file_key IS NOT NULL',
          [entityId]
        );
        if (docs.rows.length) {
          const { deleteFromR2 } = require('../../core/utils/r2Upload');
          docs.rows.forEach(d => deleteFromR2(d.file_key).catch(() => {}));
        }
      } catch (_) {}

      const result = await db.query(
        `DELETE FROM pipeline
         WHERE id = $1 AND (stage = 'cancelled' OR converted_project_id IS NOT NULL)
         RETURNING id`,
        [entityId]
      );
      if (!result.rows.length) throw Object.assign(new Error('Pipeline not found or not archived'), { statusCode: 404 });
      return result.rows[0];
    }
    default:
      throw Object.assign(new Error(`Unknown entity type: ${entityType}`), { statusCode: 400 });
  }
};
