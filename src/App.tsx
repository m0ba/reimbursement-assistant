import { useEffect } from 'react';
import { useStore } from './lib/store';
import { TaskBadge } from './components/TaskBadge';
import { Intro } from './components/Intro';
import { Confirm } from './components/Sheet';
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
  const savedFile = useStore((s) => s.savedFile);
  const setSavedFile = useStore((s) => s.setSavedFile);

  const openSavedFile = async () => {
    if (!savedFile) return;
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const SaveFile = registerPlugin<{ openFile: (o: { uri: string; mime: string }) => Promise<void> }>('SaveFile');
      await SaveFile.openFile({ uri: savedFile.uri, mime: savedFile.mime });
    } catch {
      useStore.getState().showToast('没有找到能打开这个文件的应用');
    }
    setSavedFile(null);
  };

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
      <Confirm
        open={!!savedFile}
        title="已保存"
        body={savedFile ? `文件已存到手机的「下载」文件夹：\n${savedFile.name}\n\n可以现在打开，也可以稍后去文件管理里找。` : ''}
        confirmText="打开文件"
        cancelText="知道了"
        onClose={() => setSavedFile(null)}
        onConfirm={() => void openSavedFile()}
      />
      <Intro />
    </div>
  );
}
