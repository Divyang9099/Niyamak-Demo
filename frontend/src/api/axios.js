import axios from 'axios';
// Dead import removed
import { API_BASE_URL } from './endpoints.js';
import { getErrorMessage } from '../utils/errorMessage.js';

let loadingHandlers = {
  onStart: () => {},
  onEnd: () => {},
};

export const setAxiosLoadingHandlers = ({ onStart, onEnd } = {}) => {
  loadingHandlers = {
    onStart: typeof onStart === 'function' ? onStart : () => {},
    onEnd: typeof onEnd === 'function' ? onEnd : () => {},
  };
};

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.request.use((config) => {
  // For FormData, remove Content-Type so the browser sets multipart/form-data with the correct boundary.
  // Without this, the instance-level 'application/json' default would be sent (or 'multipart/form-data'
  // without a boundary), which breaks multer's parser on the server.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  // skipLoader: true suppresses the global brand spinner (used for chunk uploads)
  if (!config.skipLoader) loadingHandlers.onStart();
  return config;
}, (error) => {
  if (!error.config?.skipLoader) loadingHandlers.onEnd();
  return Promise.reject(error);
});

// Public routes that should never trigger a redirect-to-login loop
const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/super-admin'];

axiosInstance.interceptors.response.use((response) => {
  if (!response.config?.skipLoader) loadingHandlers.onEnd();
  return response;
}, (error) => {
  if (!error.config?.skipLoader) loadingHandlers.onEnd();
  if (error.response) {
    const { status } = error.response;
    if (status === 401) {
      const alreadyPublic  = PUBLIC_PATHS.some(p => window.location.pathname.startsWith(p));
      const skipRedirect   = error.config?.skipRedirect === true;

      if (!alreadyPublic && !skipRedirect) {
        localStorage.removeItem('varuna_token');
        localStorage.removeItem('varuna_user');
        sessionStorage.removeItem('varuna_token');
        sessionStorage.removeItem('varuna_user');
        window.location.href = '/login';
      }
    }
  }
  error.userMessage = getErrorMessage(error);
  return Promise.reject(error);
});

export default axiosInstance;
