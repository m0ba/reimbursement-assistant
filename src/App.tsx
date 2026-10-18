import { useEffect } from 'react';
import { useStore } from './lib/store';
import { TaskBadge } from './components/TaskBadge';
import { Intro } from './components/Intro';
import { IconBack, IconGear } from './components/Icons';
import Home from './screens/Home';
import Invoices from './screens/Invoices';
import Trajectory from './screens/Trajectory';
import Materials from './screens/Materials';
import Settings from './screens/Settings';
import { APP_VERSION } from './lib/version';

export default function App() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const toast = useStore((s) => s.toast);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') useStore.getState().setTask({ paused: false });
      else if (useStore.getState().task.running) useStore.getState().setTask({ paused: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const titles: Record<string, string> = {
    invoices: '发票整理',
    trajectory: '轨迹图',
    materials: '材料库',
    settings: '设置',
  };

  return (
    <div className="app">
      <div className="topbar">
        {view !== 'home' && (
          <button className="icon-btn" onClick={() => setView('home', null)} aria-label="返回">
            <IconBack />
          </button>
        )}
        <TaskBadge />
        <div className="spacer" />
        {view !== 'settings' && (
          <button className="icon-btn" onClick={() => setView('settings')} aria-label="设置">
            <IconGear size={20} />
          </button>
        )}
      </div>

      {view === 'home' && <Home />}
      {view === 'invoices' && <Invoices />}
      {view === 'trajectory' && <Trajectory />}
      {view === 'materials' && <Materials />}
      {view === 'settings' && <Settings />}
      {view !== 'home' && <div style={{ height: 40 }} />}
      <div className="app-footer">报销助手 v{APP_VERSION} · 全部在本机处理</div>

      {toast && <div className="toast">{toast}</div>}
      <Intro />
    </div>
  );
}
