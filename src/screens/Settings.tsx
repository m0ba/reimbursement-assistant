import { useEffect, useState } from 'react';
import { OCR_MODELS, useStore } from '../lib/store';
import { clearAllBlobs, putBlob } from '../lib/db';
import { disposeOcr } from '../lib/ocr';
import { Confirm, Sheet } from '../components/Sheet';
import { Ring } from '../components/TaskBadge';
import { IconCheck, IconDownload, IconRefresh, IconTrash } from '../components/Icons';
import { APP_VERSION } from '../lib/version';

const RELEASE_API = 'https://api.github.com/repos/m0ba/reimbursement-assistant/releases/latest';
const VERSION_SOURCES = [
  'https://cdn.jsdelivr.net/gh/m0ba/reimbursement-assistant@main/public/version.json',
  'https://raw.githubusercontent.com/m0ba/reimbursement-assistant/main/public/version.json',
];
const DOWNLOAD_BASE = 'https://github.com/m0ba/reimbursement-assistant/releases/download';
const MIRROR = 'https://gh-proxy.com/';

type Release = {
  version: string;
  url: string;
  apk: string;
  date: string;
  notes: string[];
};

function cmpVersion(a: string, b: string) {
  const pa = a.replace(/^v/i, '').split('.').map((n) => Number(n) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

async function fetchJson(url: string, ms: number): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: ctl.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [usage, setUsage] = useState<string>('—');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [clearOpen, setClearOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [release, setRelease] = useState<Release | null>(null);
  const batches = useStore((s) => s.batches);
  const files = useStore((s) => s.files);

  const openLink = (url: string) => {
    const native = (window as any).Capacitor?.isNativePlatform?.();
    // 原生端由 WebView 拦下外链，交给系统浏览器下载；网页端开新标签。
    if (native) {
      window.location.href = url;
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

  const checkUpdate = async () => {
    if (checking) return;
    setChecking(true);
    try {
      let tag = '';
      let htmlUrl = 'https://github.com/m0ba/reimbursement-assistant/releases';
      let apkUrl = '';
      let date = '';
      let notes: string[] = [];
      try {
        const data = await fetchJson(RELEASE_API, 5500);
        tag = String(data.tag_name || '');
        htmlUrl = String(data.html_url || htmlUrl);
        date = String(data.published_at || data.created_at || '').slice(0, 10);
        const apk = (data.assets || []).find((a: { name?: string }) => String(a.name || '').endsWith('.apk'));
        apkUrl = apk?.browser_download_url || '';
        notes = String(data.body || '')
          .split('\n')
          .map((l) =>
            l
              .replace(/^[-*]\s*/, '')
              .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
              .replace(/[`*_]/g, '')
              .trim(),
          )
          .filter((l) => l && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('!'))
          .slice(0, 6);
      } catch {
        /* 接口被限流或断网时走下面的静态文件 */
      }
      if (!tag) {
        const data = await Promise.any(VERSION_SOURCES.map((src) => fetchJson(`${src}?t=${Date.now()}`, 5500)));
        const ver = String(data.version || '');
        if (ver) {
          tag = ver;
          date = String(data.date || '');
          notes = Array.isArray(data.notes) ? data.notes.slice(0, 6).map(String) : [];
          htmlUrl = `https://github.com/m0ba/reimbursement-assistant/releases/tag/v${ver}`;
          apkUrl = `${DOWNLOAD_BASE}/v${ver}/reimbursement-${ver}.apk`;
        }
      }
      if (!tag) throw new Error('tag');
      if (cmpVersion(tag, APP_VERSION) > 0) {
        setRelease({
          version: tag.replace(/^v/i, ''),
          url: htmlUrl,
          apk: apkUrl || htmlUrl,
          date,
          notes,
        });
      } else {
        useStore.getState().showToast(`已是最新版本 v${APP_VERSION}`);
      }
    } catch {
      useStore.getState().showToast('检查失败，请检查网络后重试');
    } finally {
      setChecking(false);
    }
  };

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
        <button className="btn wide tint" onClick={checkUpdate} disabled={checking}>
          <IconRefresh size={18} className={checking ? 'spin' : ''} /> {checking ? '正在检查…' : '检查更新'}
        </button>
        <p className="tiny" style={{ margin: '10px 2px 0' }}>
          发票与截图不会上传；检查更新只读取公开的版本信息。
        </p>
      </div>

      <Sheet
        open={!!release}
        onClose={() => setRelease(null)}
        title={release ? `发现新版本 v${release.version}` : ''}
        lead={release?.date ? `发布于 ${release.date}。覆盖安装即可，材料不会丢。` : '覆盖安装即可，材料不会丢。'}
      >
        {!!release?.notes.length && (
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 6 }}>这次更新</div>
            {release.notes.map((n, i) => (
              <div key={i} className="tiny" style={{ lineHeight: 1.7 }}>· {n}</div>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 10 }}>
          <button className="btn grow" onClick={() => setRelease(null)}>稍后</button>
          <button
            className="btn primary grow"
            onClick={() => {
              if (release) openLink(release.apk);
              setRelease(null);
            }}
          >
            去下载
          </button>
        </div>
        <button
          className="btn wide tint"
          style={{ marginTop: 10 }}
          onClick={() => {
            if (release) openLink(MIRROR + release.apk);
            setRelease(null);
          }}
        >
          备用下载（国内加速）
        </button>
      </Sheet>

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
