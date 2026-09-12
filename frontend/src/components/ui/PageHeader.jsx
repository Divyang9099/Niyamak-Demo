/**
 * PageHeader — the single, consistent page title block for every screen.
 *
 * Replaces the per-page ad-hoc headers (which ranged from clean `text-3xl`
 * to loud `text-4xl font-black italic`) with one calm enterprise hierarchy:
 *   eyebrow (uppercase tracked) · title (display) · description · actions
 *
 *   <PageHeader
 *     eyebrow="Central Registry"
 *     title="Project Portfolio"
 *     description="All active and archived survey projects."
 *     actions={<Button>New Project</Button>}
 *   />
 */
export const PageHeader = ({ eyebrow, title, description, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
    <div className="min-w-0">
      {eyebrow && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">
          {eyebrow}
        </p>
      )}
      <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
      {description && (
        <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">{description}</p>
      )}
    </div>
    {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
  </div>
);

export default PageHeader;
