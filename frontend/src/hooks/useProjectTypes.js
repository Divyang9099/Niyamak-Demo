import { useState, useEffect } from 'react';
import axiosInstance from '../api/axios';
import { ENDPOINTS } from '../api/endpoints';
import { PROJECT_TYPES as FALLBACK } from '../utils/constants';

// Module-level session cache — shared across all hook instances in this page load.
let _cache = null;

export function useProjectTypes() {
  const [types, setTypes] = useState(_cache || FALLBACK);

  useEffect(() => {
    if (_cache) { setTypes(_cache); return; }
    axiosInstance.get(ENDPOINTS.SYSTEM.PROJECT_TYPES)
      .then(r => {
        const rows = (r.data.data || []).filter(t => t.is_active !== false);
        _cache = rows.length
          ? rows.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
               .map(t => ({ value: t.key, label: t.label, icon: t.icon || '' }))
          : FALLBACK;
        setTypes(_cache);
      })
      .catch(() => {
        _cache = FALLBACK;
        setTypes(FALLBACK);
      });
  }, []);

  return types;
}

// Call this from ProjectTypeManager after any save/delete to force re-fetch.
export function invalidateProjectTypesCache() {
  _cache = null;
}
