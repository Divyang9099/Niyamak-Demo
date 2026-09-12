/**
 * Single source of truth for STATUS presentation across the app.
 * Project statuses (from migration 029 + 037):
 *   initiate → planned → on_going → executed → post_processing → complete | cancelled
 */
export const STATUS_META = {
  // ── Project lifecycle ─────────────────────────────────────────────────────
  initiate:        { label: 'Initiate',        variant: 'neutral', hex: '#64748B' },
  planned:         { label: 'Planned',         variant: 'info',    hex: '#3B82F6' },
  on_going:        { label: 'On Going',        variant: 'primary', hex: '#6366F1' },
  executed:        { label: 'Executed',        variant: 'primary', hex: '#8B5CF6' },
  post_processing: { label: 'Post Processing', variant: 'warning', hex: '#A855F7' },
  complete:        { label: 'Complete',        variant: 'success', hex: '#22C55E' },
  cancelled:       { label: 'Cancelled',       variant: 'danger',  hex: '#EF4444' },
  // ── Resource / workflow statuses ─────────────────────────────────────────
  active:          { label: 'Active',          variant: 'success', hex: '#22C55E' },
  inactive:        { label: 'Inactive',        variant: 'neutral', hex: '#64748B' },
  maintenance:     { label: 'Maintenance',     variant: 'warning', hex: '#F59E0B' },
  pending:         { label: 'Pending',         variant: 'warning', hex: '#F59E0B' },
  approved:        { label: 'Approved',        variant: 'success', hex: '#22C55E' },
  rejected:        { label: 'Rejected',        variant: 'danger',  hex: '#EF4444' },
  draft:           { label: 'Draft',           variant: 'neutral', hex: '#94A3B8' },
  confirmed:       { label: 'Confirmed',       variant: 'info',    hex: '#3B82F6' },
};

/** Always returns a usable meta object, even for an unknown status. */
export const statusMeta = (status) =>
  STATUS_META[status] || {
    label: status ? String(status).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Unknown',
    variant: 'default',
    hex: '#475569',
  };

export const statusLabel   = (s) => statusMeta(s).label;
export const statusVariant = (s) => statusMeta(s).variant;
export const statusColor   = (s) => statusMeta(s).hex;
