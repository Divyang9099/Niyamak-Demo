import React, { createContext, useState, useEffect, useContext } from 'react';
import axiosInstance from '../api/axios';
import { ENDPOINTS } from '../api/endpoints';

// Safe default so `const { user } = useAuth()` never throws even if a component
// renders before the provider mounts or during an HMR context desync. The real
// provider value below overrides this whenever AuthProvider is mounted.
export const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  loading: true,
  login: async () => { throw new Error('AuthProvider not mounted'); },
  logout: async () => {},
  setUser: () => {},
});

export const AuthProvider = ({ children }) => {
  // Auth is httpOnly-cookie based; the browser sends the token automatically.
  // We persist only the user *object* (not the token) so the UI can render
  // synchronously before the /profile probe completes.
  const getPersistedUser = () => {
    const raw = localStorage.getItem('varuna_user') || sessionStorage.getItem('varuna_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!getPersistedUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      // On public auth pages (login / forgot / reset) the user is, by definition,
      // signing in — there is no point probing /auth/profile, which just produces
      // a noisy 401 in the console (the browser logs every failed request, no
      // matter how JS handles it). Skip the probe entirely; restore from persisted
      // storage if present, otherwise treat as logged out. login() sets the user
      // directly after a successful sign-in.
      const publicAuthPaths = ['/login', '/forgot-password', '/reset-password'];
      const onPublicAuthPage = publicAuthPaths.some(p => window.location.pathname.startsWith(p));
      const persisted = getPersistedUser();
      if (onPublicAuthPage || !persisted) {
        setUser(persisted);
        setIsAuthenticated(!!persisted);
        setLoading(false);
        return;
      }
      try {
        // skipRedirect flag tells the 401 interceptor not to do window.location redirect —
        // this request is just a "probe" and AuthContext handles the unauthenticated case itself.
        const res = await axiosInstance.get(ENDPOINTS.AUTH.PROFILE, { skipRedirect: true });
        const payload = res?.data?.data ?? res?.data ?? null;
        const profileUser = payload?.user ?? payload;
        setUser(profileUser || getPersistedUser());
        setIsAuthenticated(!!profileUser);
      } catch {
        // 401 / network error — clear any stale persisted user so the socket
        // context doesn't briefly think auth is valid and then disconnect.
        localStorage.removeItem('varuna_user');
        sessionStorage.removeItem('varuna_user');
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (email, password, rememberMe = false, totp_code = null) => {
    try {
      const body = { email, password, remember_me: !!rememberMe };
      if (totp_code) body.totp_code = totp_code;

      const res = await axiosInstance.post(ENDPOINTS.AUTH.LOGIN, body);
      const payload = res?.data?.data ?? res?.data ?? {};
      const authUser = payload?.user || payload;

      if (!authUser) throw new Error('Invalid login response: missing user');

      // Mirror the cookie behaviour in client storage so the user object is
      // available synchronously on next load (before the /profile probe completes).
      localStorage.removeItem('varuna_user');
      sessionStorage.removeItem('varuna_user');
      if (rememberMe) {
        // Persistent: survives browser restarts (matches the server-side persistent cookie)
        localStorage.setItem('varuna_user', JSON.stringify(authUser));
      } else {
        // Session only: cleared when the browser window/tab is closed
        sessionStorage.setItem('varuna_user', JSON.stringify(authUser));
      }

      setIsAuthenticated(true);
      setUser(authUser);
      // Tell ThemeContext to load this user's saved theme from DB
      window.dispatchEvent(new Event('varuna:login'));
      return res.data;
    } catch (err) {
      throw err;
    }
  };

  const logout = async () => {
    try {
      await axiosInstance.post(ENDPOINTS.AUTH.LOGOUT);
    } catch(err) { console.error('Logout error', err); }
    
    localStorage.removeItem('varuna_user');
    sessionStorage.removeItem('varuna_user');
    // Clear legacy tokens if they exist
    localStorage.removeItem('varuna_token');
    sessionStorage.removeItem('varuna_token');
    
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};
