import { useState, useEffect, useCallback, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Detects whether the app is running as an installed PWA (standalone window).
export function useIsInstalled() {
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      window.navigator.standalone === true
  );

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const handler = (e) => setInstalled(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return installed;
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const isInstalled = useIsInstalled();

  const swRegistration = useRef(null);
  const reloadingRef   = useRef(false);

  // SW update detection via vite-plugin-pwa virtual module
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      swRegistration.current = r || null;
      // Periodically check for a new deployment every 60 minutes while open
      if (r) {
        setInterval(() => { r.update().catch(() => {}); }, 60 * 60 * 1000);
      }
    },
    onRegisterError(err) {
      console.warn('[PWA] Service worker registration failed', err);
    },
  });

  // Reload the page exactly once when the new SW takes control. This is the
  // event that actually swaps the user onto the freshly-deployed build.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onControllerChange = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  // Robust "apply update": tell the waiting worker to activate (via both the
  // plugin helper AND a direct postMessage), then guarantee a reload even if
  // the controllerchange event never fires.
  const applyUpdate = useCallback(async () => {
    try {
      const reg = swRegistration.current;
      await reg?.update?.().catch(() => {});
      // vite-plugin-pwa path (posts SKIP_WAITING + reloads on controlling)
      updateServiceWorker(true);
      // Direct path — in case the plugin can't see the waiting worker
      reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    } catch { /* ignore — fallback reload below */ }

    // Hard fallback: never leave the user stuck on a stale build
    setTimeout(() => {
      if (!reloadingRef.current) {
        reloadingRef.current = true;
        window.location.reload();
      }
    }, 2500);
  }, [updateServiceWorker]);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    const onInstalled = () => {
      setIsInstallable(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
    return outcome === 'accepted';
  }, [deferredPrompt]);

  const dismissInstall = useCallback(() => {
    setInstallDismissed(true);
    setIsInstallable(false);
  }, []);

  const dismissUpdate = useCallback(() => {
    setNeedRefresh(false);
  }, [setNeedRefresh]);

  return {
    isInstallable: isInstallable && !installDismissed && !isInstalled,
    isInstalled,
    install,
    dismissInstall,
    needRefresh,
    updateServiceWorker: applyUpdate,
    dismissUpdate,
  };
}
