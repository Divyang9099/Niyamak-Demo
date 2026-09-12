import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import axiosInstance from '../api/axios';
import { ENDPOINTS } from '../api/endpoints';

export const THEMES = [
  {
    id: 'obsidian',
    name: 'Obsidian Prime',
    tagline: 'Dark graphite · purple accent',
    swatches: ['#121317', '#1a1b21', '#8b5cf6', '#f3f4f8'],
    dark: true,
  },
  {
    id: 'light',
    name: 'Corporate Light',
    tagline: 'Clean white · professional blue',
    swatches: ['#f5f6fa', '#ffffff', '#2563eb', '#0f172a'],
    dark: false,
  },
  {
    id: 'midnight',
    name: 'Midnight Ops',
    tagline: 'Deep dark · cyan accent',
    swatches: ['#070b14', '#0d121e', '#22d3ee', '#f1f5fb'],
    dark: true,
  },
  {
    id: 'forest',
    name: 'Forest Command',
    tagline: 'Dark green operations',
    swatches: ['#0a100c', '#101812', '#34d399', '#f2f8f4'],
    dark: true,
  },
  {
    id: 'solar',
    name: 'Solar Vision',
    tagline: 'Warm light · orange accent',
    swatches: ['#faf7f0', '#ffffff', '#ea580c', '#1a1612'],
    dark: false,
  },
];

const VALID_IDS = THEMES.map(t => t.id);
const STORAGE_KEY = 'varuna_theme';
const DEFAULT_THEME = 'light';

// Maps theme ID → its primary accent colour used for the <meta name="theme-color"> tag.
// Keeps the browser chrome (tab/titlebar/address bar) in sync with the active theme.
const THEME_COLORS = {
  obsidian: '#8b5cf6',
  light:    '#2563eb',
  midnight: '#22d3ee',
  forest:   '#34d399',
  solar:    '#ea580c',
};

const applyTheme = (id) => {
  const root = document.documentElement;
  root.classList.add('theme-transition');
  root.setAttribute('data-theme', id);
  window.setTimeout(() => root.classList.remove('theme-transition'), 300);
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode */ }
  // Sync <meta name="theme-color"> so the browser chrome matches the active theme
  const metaColor = document.getElementById('meta-theme-color');
  if (metaColor) metaColor.setAttribute('content', THEME_COLORS[id] ?? '#8b5cf6');
};

const getLocalTheme = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return VALID_IDS.includes(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

const ThemeContext = createContext({ theme: DEFAULT_THEME, setTheme: () => {}, themes: THEMES });

const fetchAndApplyTheme = (setThemeState) => {
  // Don't probe the server for a theme on public auth pages — the user isn't
  // logged in yet, so it just yields a 401. Keep the locally-saved theme.
  const publicAuthPaths = ['/login', '/forgot-password', '/reset-password'];
  const onPublicAuthPage = publicAuthPaths.some(p => window.location.pathname.startsWith(p));
  const hasPersistedUser = !!localStorage.getItem('varuna_user') || !!sessionStorage.getItem('varuna_user');
  if (onPublicAuthPage || !hasPersistedUser) return;
  axiosInstance.get(ENDPOINTS.AUTH.PROFILE)
    .then(res => {
      const serverTheme = res.data?.data?.theme;
      if (serverTheme && VALID_IDS.includes(serverTheme)) {
        applyTheme(serverTheme);
        setThemeState(serverTheme);
      }
    })
    .catch(() => { /* not logged in or network error — keep local theme */ });
};

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(getLocalTheme);
  const saveTimer = useRef(null);

  useEffect(() => {
    // On mount: try immediately in case user already has a valid session cookie
    fetchAndApplyTheme(setThemeState);

    // After login (fired by AuthContext): re-load the logged-in user's theme from DB
    const onLogin = () => fetchAndApplyTheme(setThemeState);
    window.addEventListener('varuna:login', onLogin);
    return () => window.removeEventListener('varuna:login', onLogin);
  }, []);

  const setTheme = useCallback((id) => {
    if (!VALID_IDS.includes(id)) return;

    applyTheme(id);
    setThemeState(id);

    // Debounce API save — 600ms after last change
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      axiosInstance.patch(ENDPOINTS.AUTH.THEME, { theme: id })
        .catch(() => { /* silent fail — localStorage already saved */ });
    }, 600);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;
