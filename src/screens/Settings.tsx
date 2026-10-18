import { useEffect, useState } from 'react';
import { OCR_MODELS, useStore } from '../lib/store';
import { clearAllBlobs, putBlob } from '../lib/db';
import { disposeOcr } from '../lib/ocr';
import { Confirm } from '../components/Sheet';
import { Ring } from '../components/TaskBadge';
import { IconCheck, IconDownload, IconTrash } from '../components/Icons';
import { APP_VERSION } from '../lib/version';

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [usage, setUsage] = useState<string>('—');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [clearOpen, setClearOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<string | null>(null);
  const batches = useStore((s) => s.batches);
  const files = useStore((s) => s.files);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      const mb = (e.usage || 0) / 1024 / 1024;
      setUsage(mb > 0 ? `${mb.toFixed(1)} MB` : '—');
    });
  }, [batches.length, files.length]);

  const install = async (id: string, file: string) => {
    setDownloading(id);
    setPct(0);
    try {
      const res = await fetch(`/tessdata/${file}`);
      const total = Number(res.headers.get('content-length') || 0);
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          got += value.length;
          if (total) setPct(got / total);
        }
      }
      const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' });
      await putBlob(`ocr_${id}`, blob);
      setSettings({ installedModels: Array.from(new Set([...settings.installedModels, id])) });
      useStore.getState().showToast('模型已安装到本机');
    } catch {
      useStore.getState().showToast('下载失败，请重试');
    } finally {
      setDownloading(null);
      setPct(0);
    }
  };

  return (
    <div className="page">
      <div className="large-title">设置</div>
      <div className="subtitle">换识别模型、清空本机数据、看版本和帮助都在这里。所有材料只存在这台手机上，不会上传。</div>

      <div className="section-title">OCR 模型</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {OCR_MODELS.map((m, idx) => {
          const installed = settings.installedModels.includes(m.id);
          const active = settings.ocrModelId === m.id;
          return (
            <div key={m.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <button
                onClick={() => installed && setSettings({ ocrModelId: m.id })}
                style={{ width: 24, marginTop: 2, color: active ? 'var(--blue)' : 'var(--text3)' }}
                aria-label="选择模型"
              >
                {active ? <IconCheck size={20} /> : <span style={{ display: 'block', width: 16, height: 16, borderRadius: 8, border: '2px solid currentColor' }} />}
              </button>
              <div className="grow">
                <div className="title">{m.name}</div>
                <div className="meta">{m.mb} MB · {m.note}</div>
                {m.builtin && <span className="chip ok" style={{ marginTop: 6 }}>默认 · 不可删除</span>}
                {!m.builtin && installed && <span className="chip" style={{ marginTop: 6 }}>已安装</span>}
                {downloading === m.id && (
                  <div className="progress-track" style={{ marginTop: 8 }}>
                    <i style={{ width: `${Math.round(pct * 100)}%` }} />
                  </div>
                )}
              </div>
              {!installed && (
                <button className="icon-btn" onClick={() => install(m.id, m.file)} aria-label="下载">
                  <IconDownload size={18} />
                </button>
              )}
              {installed && !m.builtin && (
                <button className="icon-btn" onClick={() => setDelTarget(m.id)} aria-label="删除">
                  <IconTrash size={18} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="tiny" style={{ margin: '8px 6px 0' }}>模型只能从程序内置目录下载，安装后校验文件完整性；默认模型不可删除。</div>

      <div className="section-title">存储与清理</div>
      <div className="card">
        <div className="row between">
          <div>
            <div style={{ fontWeight: 600 }}>本机占用</div>
            <div className="tiny">{batches.length} 个批次 · {files.length} 个成品</div>
          </div>
          <span className="mono muted">{usage}</span>
        </div>
        <div className="divider" />
        <button className="btn wide danger" style={{ background: 'rgba(255,59,48,.1)' }} onClick={() => setClearOpen(true)}>
          清空所有缓存与数据
        </button>
      </div>

      <div className="section-title">程序信息</div>
      <div className="card">
        <div className="row between"><span>版本</span><span className="muted mono">{APP_VERSION}</span></div>
        <div className="divider" />
        <button
          className="row between"
          style={{ width: '100%', padding: '4px 0' }}
          onClick={async () => {
            const regs = await navigator.serviceWorker?.getRegistrations?.();
            await Promise.all((regs || []).map((r) => r.unregister()));
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
            location.reload();
          }}
        >
          <span style={{ fontWeight: 600 }}>检查更新</span>
          <span className="tiny">清掉旧缓存并重新加载</span>
        </button>
        <p className="tiny" style={{ marginBottom: 0 }}>
          发票与截图不会上传。所有识别、拼版、导出都在浏览器内完成，关闭程序后数据仍保存在本机，清空即删除。
        </p>
      </div>

      <div className="section-title">帮助</div>
      <div className="card">
        <details>
          <summary style={{ fontWeight: 600 }}>为什么有发票显示“未识别”？</summary>
          <p className="tiny">扫描件或图片型 PDF 没有文字层，无法读取号码与金额。拼版不受影响，可在信息表里手动补充。</p>
        </details>
        <div className="divider" />
        <details>
          <summary style={{ fontWeight: 600 }}>为什么这张截图要我自己选时间？</summary>
          <p className="tiny">只认图内应用头部的完整年月日；系统状态栏的时分不算。识别不到时不会猜，避免排错顺序。</p>
        </details>
        <div className="divider" />
        <details>
          <summary style={{ fontWeight: 600 }}>切到后台为什么会暂停？</summary>
          <p className="tiny">iOS 会挂起网页里的运算，回到前台会自动接着跑，已完成的部分不会重做。</p>
        </details>
        <div className="divider" />
        <button className="row between" style={{ width: '100%', padding: '4px 0' }} onClick={() => setSettings({ introSeen: false })}>
          <span style={{ fontWeight: 600 }}>重新查看启动说明</span>
          <span className="tiny">再次显示欢迎页</span>
        </button>
      </div>

      <Confirm
        open={clearOpen}
        title="清空所有缓存与数据？"
        body={`将删除 ${batches.length} 个批次、${files.length} 个成品以及已下载的额外 OCR 模型。\n默认模型与设置保留，此操作不可恢复。`}
        confirmText="全部清空"
        danger
        onClose={() => setClearOpen(false)}
        onConfirm={async () => {
          await clearAllBlobs();
          await disposeOcr();
          useStore.getState().resetAll();
          setClearOpen(false);
          useStore.getState().showToast('已清空');
        }}
      />

      <Confirm
        open={!!delTarget}
        title="删除这个 OCR 模型？"
        body="删除后需要重新下载才能使用，默认模型不受影响。"
        confirmText="删除"
        danger
        onClose={() => setDelTarget(null)}
        onConfirm={async () => {
          if (delTarget) {
            setSettings({
              installedModels: settings.installedModels.filter((x) => x !== delTarget),
              ocrModelId: settings.ocrModelId === delTarget ? 'eng-fast' : settings.ocrModelId,
            });
          }
          setDelTarget(null);
        }}
      />
    </div>
  );
}
