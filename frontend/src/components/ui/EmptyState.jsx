/**
 * EmptyState — one reusable, guiding empty state for tables, lists and panels.
 *
 * An empty screen should orient the user and offer the next action, not show a
 * bare icon. Pass an optional `action` (usually a <Button>) to give a clear CTA.
 *
 *   <EmptyState
 *     icon="folder_open"
 *     title="No projects yet"
 *     description="Create your first survey project to get started."
 *     action={<Button icon="add">New Project</Button>}
 *   />
 */
export const EmptyState = ({ icon = 'inbox', title = 'Nothing here yet', description, action, className = '' }) => (
  <div className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`}>
    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
      <span className="material-symbols-outlined text-[28px] text-slate-300">{icon}</span>
    </div>
    <p className="text-sm font-semibold text-slate-700">{title}</p>
    {description && <p className="text-xs text-slate-400 mt-1.5 max-w-xs leading-relaxed">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
