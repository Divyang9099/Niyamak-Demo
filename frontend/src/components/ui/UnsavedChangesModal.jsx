import { createPortal } from 'react-dom';

/**
 * Renders a compact confirmation dialog when the RR7 useBlocker fires.
 * Pass the blocker returned by useUnsavedGuard(isDirty).
 */
export const UnsavedChangesModal = ({ blocker }) => {
  if (blocker.state !== 'blocked') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center px-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <div className="bg-surface border border-slate-200 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-scale-in">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-500 text-2xl mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
          <div>
            <h3 className="text-base font-bold text-slate-900">Unsaved changes</h3>
            <p className="text-sm text-slate-500 mt-0.5">You have unsaved changes that will be lost if you leave this page.</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => blocker.reset()}
            className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Stay
          </button>
          <button
            onClick={() => blocker.proceed()}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            Leave anyway
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
