import { useEffect } from 'react';

/**
 * Locks body scroll while `isLocked` is true.
 * Restores the previous overflow value on cleanup so nested overlays
 * (e.g. a modal opened on top of a drawer) don't prematurely unlock.
 */
const useScrollLock = (isLocked) => {
  useEffect(() => {
    if (!isLocked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isLocked]);
};

export default useScrollLock;
