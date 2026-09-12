/**
 * Restricted project-document visibility
 * ──────────────────────────────────────
 * Some document categories ("Commercial Documents") hold commercially sensitive
 * files — quotations, rate cards, priced purchase orders. The owner's rule is:
 * pilots must not see them at all, even though they are members of the project.
 *
 * The gate mirrors requireProjectRole('project_manager') — the exact same rule
 * that already governs uploading / editing / deleting project documents:
 *   • admin / super_admin  → always allowed (universal access, as everywhere)
 *   • project_members.role = 'project_manager' on THAT project → allowed
 *   • everyone else (pilots, non-members, PMs of other projects) → denied
 *
 * "Denied" means the row never leaves the server: it is filtered out of the list,
 * out of the map's KML picker, and the download endpoint refuses it. Category is
 * free text in the DB (three code paths write it), so matching is trimmed and
 * case-insensitive.
 */
const db = require('../config/db');
const { RESTRICTED_DOC_CATEGORIES } = require('./constants');

// Lower-cased copy used for both JS comparisons and the SQL `<> ALL(...)` filters.
const RESTRICTED_LC = RESTRICTED_DOC_CATEGORIES.map(c => c.toLowerCase());

/** True when this category string is one of the restricted categories. */
const isRestrictedCategory = (category) =>
  Boolean(category) && RESTRICTED_LC.includes(String(category).trim().toLowerCase());

/**
 * Can this user see restricted documents on this project?
 * @param {{id: string, role: string}} user  req.user
 * @param {string} projectId
 * @returns {Promise<boolean>}
 */
const canViewRestrictedDocs = async (user, projectId) => {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'super_admin') return true;
  if (!projectId) return false;

  const result = await db.query(
    'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, user.id]
  );
  return result.rows[0]?.role === 'project_manager';
};

/**
 * SQL fragment that hides restricted rows unless the caller is allowed to see them.
 * Callers pass the two bind params in this order: [includeRestricted, RESTRICTED_LC].
 *
 *   const { text, params } = restrictedSqlFilter('d.category', allowed, 2);
 *   `... WHERE d.project_id = $1 AND ${text}`  → params spread as $2, $3
 */
const restrictedSqlFilter = (columnExpr, includeRestricted, firstParamIndex) => ({
  text:
    `($${firstParamIndex}::boolean OR ${columnExpr} IS NULL ` +
    `OR LOWER(TRIM(${columnExpr})) <> ALL($${firstParamIndex + 1}::text[]))`,
  params: [Boolean(includeRestricted), RESTRICTED_LC],
});

module.exports = {
  RESTRICTED_DOC_CATEGORIES,
  RESTRICTED_LC,
  isRestrictedCategory,
  canViewRestrictedDocs,
  restrictedSqlFilter,
};