import React, { Suspense, useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Breadcrumbs from './Breadcrumbs';
import UploadDock from '../upload/UploadDock';
import { ContentSkeleton } from '../ui/Skeletons';
import { CommandPalette } from '../ui/CommandPalette';
import { ROUTES } from '../../utils/constants';
import useScrollLock from '../../hooks/useScrollLock';

const isInput = (el) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) || el?.isContentEditable;

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const navigate = useNavigate();
  useScrollLock(sidebarOpen);

  useEffect(() => {
    const handler = (e) => {
      // Ctrl+K — command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(o => !o);
        return;
      }
      // Escape — close mobile sidebar
      if (e.key === 'Escape') { setSidebarOpen(false); return; }
      // Skip shortcuts when user is typing
      if (isInput(document.activeElement)) return;
      // N — new project
      if (e.key === 'n' || e.key === 'N') { navigate(ROUTES.PROJECTS + '/new'); return; }
      // G + key navigation (gmail-style): G then P = Projects, G then D = Dashboard, etc.
      if (e.key === '?') { setCmdOpen(true); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navigate]);

  return (
    <div className="min-h-screen w-full bg-background text-on-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[1100] md:hidden transition-all duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="flex flex-col min-w-0 md:pl-64">
        <Topbar setSidebarOpen={setSidebarOpen} />

        {/* Global breadcrumb + back bar — one consistent navigation system on every
            page. Sits between the Topbar and page content and reflects the URL. */}
        <div className="sticky top-16 md:top-20 z-[850] bg-surface/85 backdrop-blur border-b border-slate-200/70 px-4 md:px-8 py-2">
          <div className="max-w-[1600px] mx-auto w-full">
            <Breadcrumbs />
          </div>
        </div>

        <main className="flex-1 min-w-0 overflow-x-clip">
          <div className="p-4 md:p-6 lg:p-8 space-y-5 md:space-y-6 max-w-[1600px] mx-auto w-full">
            {/* Inner Suspense keeps the sidebar + topbar mounted while a lazily
                loaded page chunk resolves — only the content shows a skeleton. */}
            <Suspense fallback={<ContentSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {/* Global upload manager — persists across navigation so in-progress
          uploads stay visible even after switching pages/tabs. */}
      <UploadDock />

      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
};

export default MainLayout;
