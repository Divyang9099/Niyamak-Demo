import { useState } from 'react';

const STORAGE_KEY = 'bd_how_this_works_dismissed';

export const BDHowThisWorks = () => {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="flex items-center gap-2.5 bg-primary/5 border border-primary/15 rounded-xl px-3.5 py-2.5 text-xs">
      <span className="material-symbols-outlined text-primary text-base shrink-0">lightbulb</span>
      <p className="flex-1 font-semibold text-slate-600">
        Add a client, log outreach on a channel, and follow-ups are tracked automatically.
      </p>
      <button onClick={dismiss} className="text-slate-400 hover:text-slate-700 shrink-0 p-0.5" title="Dismiss">
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </div>
  );
};

export default BDHowThisWorks;
