import React from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import useScrollLock from '../../hooks/useScrollLock';

/**
 * Modal — supports an optional `footer` prop.
 * When `footer` is provided it renders in a sticky bar below the scrollable
 * content so action buttons are ALWAYS visible regardless of viewport height.
 * Closes on Escape and locks body scroll while open.
 */
export const Modal = ({ isOpen, onClose, title, children, footer, className }) => {
  useScrollLock(isOpen);
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center backdrop-blur-sm p-4 animate-fade-in bg-black/45"
      onClick={(e) => { /* backdrop click intentionally ignored — use Close/Cancel button */ }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={clsx(
          "bg-surface border border-slate-200 rounded-2xl shadow-pop w-full max-h-[92vh] flex flex-col animate-scale-in",
          !className?.includes('max-w-') && "max-w-lg",
          className
        )}
      >
        {/* Header — fixed */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors p-1.5"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-6 py-5 flex-1 overflow-y-auto custom-scrollbar text-slate-700 min-h-0">
          {children}
        </div>

        {/* Footer — always visible if provided */}
        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-surface rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
