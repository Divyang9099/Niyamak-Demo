import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';
import { ToastProvider } from './context/ToastContext';
import { SocketProvider } from './context/SocketContext';
import { DialogProvider } from './context/DialogContext';
import { ThemeProvider } from './context/ThemeContext';
import { BreadcrumbProvider } from './context/BreadcrumbContext';
import PWAInstallPrompt from './components/pwa/PWAInstallPrompt';

// The old global logo/spinner overlay (and the first-visit emblem splash) have
// been removed in favour of per-page skeletons (see components/ui/Skeletons.jsx
// wired through MainLayout's Suspense and each page's own loading state).
function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <DialogProvider>
            <AuthProvider>
              <SocketProvider>
                <BreadcrumbProvider>
                  <AppRoutes />
                  <PWAInstallPrompt />
                </BreadcrumbProvider>
              </SocketProvider>
            </AuthProvider>
          </DialogProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
