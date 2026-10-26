import { useEffect, useState } from 'react';
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
import Purchase from './screens/Purchase';
import { APP_VERSION } from './lib/version';

export default function App() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const toast = useStore((s) => s.toast);
  const savedFile = useStore((s) => s.savedFile);
  const setSavedFile = useStore((s) => s.setSavedFile);
  const isDesktop = !!(window as any).desktopApp?.platform;
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 859px)');
    const fine = window.matchMedia('(pointer: fine)');
    const update = () => setNarrow(mq.matches && (!!(window as any).desktopApp?.platform || fine.matches));
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const openSavedFile = async () => {
    if (!savedFile) return;
    const desk = (window as any).desktopApp;
    if (desk?.openPath && savedFile.uri.startsWith('/')) {
      await desk.openPath(savedFile.uri);
      setSavedFile(null);
      return;
    }
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
    const desk = (window as any).desktopApp;
    desk?.onDownloadDone?.((info: { name: string; path: string }) => {
      useStore.getState().setSavedFile({ name: info.name, uri: info.path, mime: '' });
    });
  }, []);

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
    purchase: '采购清单',
  };

  return (
    <div className={'app' + (view === 'purchase' ? ' app-wide' : '')}>
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

      {narrow && (
        <div className="narrow-hint">窗口较窄，已切换为手机布局；把窗口拉宽可以显示完整表格。</div>
      )}

      {view === 'home' && <Home />}
      {view === 'invoices' && <Invoices />}
      {view === 'trajectory' && <Trajectory />}
      {view === 'materials' && <Materials />}
      {view === 'settings' && <Settings />}
      {view === 'purchase' && <Purchase />}
      {view !== 'home' && <div style={{ height: 40 }} />}
      <div className="app-footer">报销助手 v{APP_VERSION} · 全部在本机处理</div>

      {toast && <div className="toast">{toast}</div>}
      <Confirm
        open={!!savedFile}
        title="已保存"
        body={savedFile ? `文件已存到${isDesktop ? '电脑' : '手机'}的「下载」文件夹：\n${savedFile.name}\n\n可以现在打开，也可以稍后去文件管理里找。` : ''}
        confirmText="打开文件"
        cancelText="知道了"
        onClose={() => setSavedFile(null)}
        onConfirm={() => void openSavedFile()}
      />
      <Intro />
    </div>
  );
}
