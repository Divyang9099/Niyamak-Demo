import React, { forwardRef, useState } from 'react';
import clsx from 'clsx';

// Indian mobile: 10 digits starting with 6-9, or optionally prefixed with 91
const PHONE_RE  = /^(91)?[6-9]\d{9}$/;
// Basic email
const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const getBuiltinError = (type, val) => {
  if (!val) return null;
  if (type === 'tel') {
    const digits = val.replace(/[\s\-().+]/g, '');
    if (!PHONE_RE.test(digits)) return 'Enter a valid 10-digit mobile number (e.g. 98765 43210)';
  }
  if (type === 'email') {
    if (!EMAIL_RE.test(val)) return 'Enter a valid email address';
  }
  return null;
};

export const Input = forwardRef(({
  label,
  error,
  className,
  id,
  icon,
  variant = 'light',
  inputClassName,
  rightAdornment,
  labelClassName,
  containerClassName,
  value,
  onBlur,
  type,
  ...props
}, ref) => {
  const [touched, setTouched]     = useState(false);
  // Coerce null → '' so React never sees a null `value` (causes controlled→uncontrolled warning)
  const safeValue = value == null ? '' : value;
  // Unified light input — `variant` kept for API compatibility but both render light now
  const inputClass = 'w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-200 font-body';

  const builtinError = touched && !error ? getBuiltinError(type, safeValue) : null;
  const displayError = error || builtinError;
  const errorId = displayError && id ? `${id}-error` : undefined;

  const handleBlur = (e) => {
    setTouched(true);
    onBlur?.(e);
  };

  return (
    <div className={clsx("flex flex-col gap-1.5 w-full", className)}>
      {label && (
        <label
          htmlFor={id}
          className={clsx(
            "text-xs font-semibold tracking-wide text-slate-600",
            labelClassName,
          )}
        >
          {label}
          {props.required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}
      <div className={clsx('relative w-full', containerClassName)}>
        {icon && (
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg pointer-events-none text-slate-400">
            {icon}
          </span>
        )}
        <input
          id={id}
          ref={ref}
          type={type}
          aria-invalid={Boolean(displayError)}
          aria-describedby={errorId}
          className={clsx(
            inputClass,
            icon ? 'pl-10' : 'px-4',
            rightAdornment ? 'pr-11' : 'pr-4',
            displayError && 'border-red-400 focus:ring-red-200 focus:border-red-500',
            inputClassName,
          )}
          value={safeValue}
          onBlur={handleBlur}
          {...props}
        />
        {rightAdornment && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightAdornment}
          </div>
        )}
      </div>
      {displayError && (
        <span id={errorId} className="text-xs mt-1 text-red-600 flex items-center gap-1">
          <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
          {displayError}
        </span>
      )}
    </div>
  );
});

Input.displayName = 'Input';
