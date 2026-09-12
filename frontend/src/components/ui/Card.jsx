import React from 'react';
import clsx from 'clsx';

export const Card = ({ children, className, title, action }) => {
  return (
    <div className={clsx("bg-surface border border-slate-200/70 p-5 md:p-6 rounded-2xl shadow-card", className)}>
      {(title || action) && (
        <div className="flex justify-between items-center mb-5">
          {title && <h3 className="text-base md:text-lg font-bold text-slate-900 max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div>
        {children}
      </div>
    </div>
  );
};
