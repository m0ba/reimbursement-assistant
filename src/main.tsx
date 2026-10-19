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

const isDesktopShell = !!(window as any).desktopApp?.platform;

if (isDesktopShell && 'serviceWorker' in navigator) {
  // 桌面版是本地文件，不需要离线缓存；顺手清掉旧版本留下的缓存，避免加载到旧代码
  void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}

if ('serviceWorker' in navigator && !isDesktopShell) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  void forceFreshIfStale();
}

async function applyNativeInsets() {
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const Insets = registerPlugin<{ get: () => Promise<{ top: number; bottom: number }> }>('Insets');
    const res = await Insets.get();
    const root = document.documentElement;
    if (res && res.top > 0) root.style.setProperty('--safe-top', `${Math.round(res.top)}px`);
    if (res && res.bottom > 0) root.style.setProperty('--safe-bottom', `${Math.round(res.bottom)}px`);
  } catch {
    /* 网页端没有原生插件，继续用 env() 的兜底值 */
  }
}

if ((window as any).Capacitor?.isNativePlatform?.()) {
  void applyNativeInsets();
  window.setTimeout(() => void applyNativeInsets(), 600);
  let insetsTimer = 0;
  const refreshInsets = () => {
    window.clearTimeout(insetsTimer);
    insetsTimer = window.setTimeout(() => void applyNativeInsets(), 160);
  };
  window.addEventListener('resize', refreshInsets);
  window.addEventListener('orientationchange', refreshInsets);
  window.visualViewport?.addEventListener('resize', refreshInsets);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
