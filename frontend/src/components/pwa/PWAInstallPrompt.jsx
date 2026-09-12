import { useEffect, useRef } from 'react';
import { usePWA } from '../../hooks/usePWA';

// Thin animated banner that slides up from the bottom for install + update toasts.
// Rendered once at the App level — never blocks any page content.
export default function PWAInstallPrompt() {
  const {
    isInstallable,
    install,
    dismissInstall,
    needRefresh,
    updateServiceWorker,
    dismissUpdate,
  } = usePWA();

  const installRef = useRef(null);
  const updateRef  = useRef(null);

  // Keyboard trap: Escape dismisses either banner
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return;
      if (needRefresh) dismissUpdate();
      if (isInstallable) dismissInstall();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [needRefresh, isInstallable, dismissUpdate, dismissInstall]);

  const handleInstall = async () => {
    const accepted = await install();
    if (!accepted) dismissInstall();
  };

  const handleUpdate = () => updateServiceWorker(true);

  if (!isInstallable && !needRefresh) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{ position: 'fixed', bottom: '1rem', left: 0, right: 0, zIndex: 9999, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
    >
      {/* ── Install banner ─────────────────────────────────────────────── */}
      {isInstallable && (
        <div
          ref={installRef}
          role="dialog"
          aria-label="Install Niyamak as a desktop app"
          style={{
            pointerEvents: 'auto',
            background: 'rgb(var(--c-surface))',
            border: '1px solid rgb(var(--sl-200) / .6)',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-pop)',
            padding: '0.875rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            width: 'min(480px, calc(100vw - 2rem))',
            animation: 'pwa-slide-up 0.3s cubic-bezier(.16,1,.3,1) both',
          }}
        >
          <img
            src="/icons/pwa-72x72.png"
            alt=""
            aria-hidden="true"
            style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 800, color: 'rgb(var(--sl-900))' }}>
              Install Niyamak
            </p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgb(var(--sl-500))', marginTop: 1 }}>
              Add to desktop for a native app experience
            </p>
          </div>
          <button
            onClick={handleInstall}
            style={{
              flexShrink: 0,
              padding: '0.4rem 0.9rem',
              background: 'rgb(var(--c-primary))',
              color: 'rgb(var(--c-on-primary))',
              border: 'none',
              borderRadius: 8,
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Install
          </button>
          <button
            onClick={dismissInstall}
            aria-label="Dismiss install prompt"
            style={{
              flexShrink: 0,
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              border: '1px solid rgb(var(--sl-200) / .4)',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'rgb(var(--sl-500))',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Update toast ───────────────────────────────────────────────── */}
      {needRefresh && (
        <div
          ref={updateRef}
          role="dialog"
          aria-label="App update available"
          style={{
            pointerEvents: 'auto',
            background: 'rgb(var(--c-surface))',
            border: '1px solid rgb(var(--c-primary) / .5)',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-pop)',
            padding: '0.875rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            width: 'min(420px, calc(100vw - 2rem))',
            animation: 'pwa-slide-up 0.3s cubic-bezier(.16,1,.3,1) both',
          }}
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined"
            style={{ fontSize: 24, color: 'rgb(var(--c-primary))', flexShrink: 0 }}
          >
            system_update
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 800, color: 'rgb(var(--sl-900))' }}>
              Update Available
            </p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgb(var(--sl-500))', marginTop: 1 }}>
              A new version of Niyamak is ready
            </p>
          </div>
          <button
            onClick={handleUpdate}
            style={{
              flexShrink: 0,
              padding: '0.4rem 0.9rem',
              background: 'rgb(var(--c-primary))',
              color: 'rgb(var(--c-on-primary))',
              border: 'none',
              borderRadius: 8,
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
          <button
            onClick={dismissUpdate}
            aria-label="Dismiss update notification"
            style={{
              flexShrink: 0,
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              border: '1px solid rgb(var(--sl-200) / .4)',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'rgb(var(--sl-500))',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>
      )}

      <style>{`
        @keyframes pwa-slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
