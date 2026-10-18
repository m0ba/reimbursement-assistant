import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { APP_VERSION } from './lib/version';

async function forceFreshIfStale() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (data?.version && data.version !== APP_VERSION) {
      const flag = 'reimb-reloaded-for-' + data.version;
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, '1');
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs || []).map((r) => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      location.reload();
    }
  } catch {
    /* 离线或没有 version.json 时忽略 */
  }
}

if ('serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  void forceFreshIfStale();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
