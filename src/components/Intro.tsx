import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Sheet';
import { useStore } from '../lib/store';
import { preloadOcr } from '../lib/ocr';

const POINTS = [
  '发票拼版、发票信息表、行程轨迹图，直接打印',
  '文件只在这台设备上处理，不上传、不外发',
  '首次打开会先准备识别模型（约 10MB）',
  '中途切走或关掉都没关系，回来能接着做',
];

export function Intro() {
  const seen = useStore((s) => s.settings.introSeen);
  const model = useStore((s) => s.settings.ocrModelId);
  const [open, setOpen] = useState(!seen);
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState('正在准备识别模型');
  const started = useRef(false);

  useEffect(() => {
    if (!seen) setOpen(true);
  }, [seen]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void preloadOcr(model, (p, l) => {
      setPct(p);
      setLabel(l);
    });
  }, [model]);

  const close = () => {
    setOpen(false);
    useStore.getState().setSettings({ introSeen: true });
  };

  return (
    <Dialog open={open} onClose={close} dismissable={false}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>欢迎使用报销助手</div>
        <div className="tiny" style={{ marginTop: 4 }}>把报销材料收拾成能直接打印的样子</div>
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
        {POINTS.map((p) => (
          <div key={p} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
            <span
              style={{
                width: 6, height: 6, borderRadius: 3, background: 'var(--blue)',
                marginTop: 8, flex: 'none',
              }}
            />
            <span style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.55, textWrap: 'pretty' } as any}>{p}</span>
          </div>
        ))}
      </div>

      <div style={{ background: 'rgba(120,120,128,.09)', borderRadius: 14, padding: 12, marginBottom: 14 }}>
        <div className="row between" style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
          <span>{label}</span>
          <span className="mono">{Math.round(pct * 100)}%</span>
        </div>
        <div className="progress-track">
          <i style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
      </div>

      <button className="btn primary wide" onClick={close}>已阅读</button>
    </Dialog>
  );
}
