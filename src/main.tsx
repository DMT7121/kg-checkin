import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadInitialController = Boolean(navigator.serviceWorker.controller);
  let swReloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadInitialController || swReloading) return;
    swReloading = true;
    try {
      const lastReload = Number(sessionStorage.getItem('kg_sw_reload_ts') || '0');
      if (Date.now() - lastReload < 15000) return;
      sessionStorage.setItem('kg_sw_reload_ts', String(Date.now()));
    } catch {
      // Ignore storage access errors in private mode
    }
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        const checkUpdate = () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch(() => undefined);
          }
        };
        document.addEventListener('visibilitychange', checkUpdate);
        window.addEventListener('focus', checkUpdate);
      })
      .catch(() => undefined);
  });
}
