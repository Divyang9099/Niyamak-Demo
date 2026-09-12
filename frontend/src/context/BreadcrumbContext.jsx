import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Lets detail pages contribute a friendly label for their (dynamic) route so the
 * global breadcrumb shows e.g. "Clients / X-Way" instead of "Clients / <uuid>".
 * Labels are keyed by the exact pathname they belong to.
 */
const BreadcrumbContext = createContext({ labels: {}, setLabel: () => {} });

export const BreadcrumbProvider = ({ children }) => {
  const [labels, setLabels] = useState({});
  const setLabel = useCallback((path, label) => {
    setLabels(prev => (prev[path] === label ? prev : { ...prev, [path]: label }));
  }, []);
  return (
    <BreadcrumbContext.Provider value={{ labels, setLabel }}>
      {children}
    </BreadcrumbContext.Provider>
  );
};

export const useBreadcrumbLabels = () => useContext(BreadcrumbContext).labels;

/** Detail pages call this with the entity name to label the current route. */
export const useSetBreadcrumb = (label) => {
  const { setLabel } = useContext(BreadcrumbContext);
  const { pathname } = useLocation();
  useEffect(() => {
    if (label) setLabel(pathname, label);
  }, [pathname, label, setLabel]);
};

export default BreadcrumbContext;
