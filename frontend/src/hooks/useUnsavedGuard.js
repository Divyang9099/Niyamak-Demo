import { useEffect, useRef, useState } from 'react';

/**
 * Warns the user about unsaved changes when `isDirty` is true — covers both
 * browser-level navigation (tab close / refresh / typed URL) via `beforeunload`,
 * and the browser back/forward buttons via a history trap.
 *
 * NOTE: the app mounts <BrowserRouter> (the component router), which does NOT
 * provide a data router, so React Router's useBlocker() isn't available here
 * (it throws "useBlocker must be used within a data router"). Back/forward is
 * therefore handled manually: while dirty, we push a sentinel history entry so
 * the first back-press only fires a `popstate` we can intercept, rather than
 * actually leaving the page. If the user confirms, we replay the back
 * navigation; if they cancel, we re-push the sentinel to stay put.
 *
 * Returns a blocker-shaped object compatible with <UnsavedChangesModal blocker={blocker} />.
 */
export function useUnsavedGuard(isDirty) {
  const [blocked, setBlocked] = useState(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;

    // Sentinel entry — a back-press consumes this instead of the real page,
    // firing `popstate` while we're still "on" the form (URL unchanged).
    window.history.pushState({ __unsavedGuard: true }, '');

    const onPopState = () => {
      if (!isDirtyRef.current) return;
      setBlocked(true);
    };

    window.addEventListener('popstate', onPopState);
    // NOTE: on a clean disarm (save succeeds, isDirty -> false) we deliberately
    // leave the sentinel entry in place rather than trying to pop it with
    // go(-1) here — that call is async and would race with the `navigate()`
    // the caller fires right after setIsDirty(false), potentially hijacking
    // that navigation. The cost is one harmless extra history entry with the
    // same URL, which a future back-press silently skips over.
    return () => window.removeEventListener('popstate', onPopState);
  }, [isDirty]);

  const proceed = () => {
    isDirtyRef.current = false; // avoid re-trapping our own cleanup navigation
    setBlocked(false);
    // The back-press that triggered `blocked` already consumed the sentinel and
    // left us sitting on the form page itself — one more `go(-1)` actually leaves it.
    window.history.go(-1);
  };

  const reset = () => {
    setBlocked(false);
    // Re-arm the sentinel so a second back-press traps again.
    window.history.pushState({ __unsavedGuard: true }, '');
  };

  return { state: blocked ? 'blocked' : 'unblocked', proceed, reset };
}
