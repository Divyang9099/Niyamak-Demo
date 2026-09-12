import React from 'react';
import clsx from 'clsx';

export const Button = ({ children, variant = 'primary', size = 'md', className, icon, isLoading = false, disabled, 'aria-label': ariaLabel, title, ...props }) => {
  const baseClass = "rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2";

  // Icon-only buttons (no visible text) get an accessible label derived from the
  // icon name, so screen readers and tooltips aren't empty.
  const hasText = children !== undefined && children !== null && children !== '';
  const computedLabel = ariaLabel || (!hasText && icon ? icon.replace(/_/g, ' ') : undefined);

  const variants = {
    primary:   "bg-primary text-on-primary hover:bg-primary-dark shadow-glow",
    secondary: "bg-surface border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-soft",
    danger:    "bg-red-50 border border-red-200 text-red-600 hover:bg-red-100",
    text:      "text-primary hover:bg-primary-light underline-offset-4 hover:underline",
    ghost:     "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
    xl: "px-8 py-4 text-sm uppercase tracking-widest",
  };

  return (
    <button
      className={clsx(baseClass, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      aria-label={computedLabel}
      title={title || computedLabel}
      {...props}
    >
      {isLoading && (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {!isLoading && icon && <span className="material-symbols-outlined text-sm">{icon}</span>}
      <span className="relative z-10">{children}</span>
    </button>
  );
};
