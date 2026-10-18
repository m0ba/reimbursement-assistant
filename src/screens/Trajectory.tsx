import { useEffect, useMemo, useRef, useState } from 'react';
import { Reorder, motion, useDragControls } from 'framer-motion';
import { useStore } from '../lib/store';
import type { TrajItem } from '../lib/types';
import { exportTrajectory, importTrajectoryFiles, restoreTraj, setTrajTime, skipAllUnknown, skipTraj } from '../lib/flows';
import { Sheet } from '../components/Sheet';
import { useBlobUrl } from '../components/PdfThumb';
import { IconPlus, IconRoute } from '../components/Icons';
import { EmptyState } from '../components/EmptyState';

function TrajCard({
  item,
  onPick,
  onSkip,
  onRestore,
}: {
  item: TrajItem;
  onPick: () => void;
  onSkip: () => void;
  onRestore: () => void;
}) {
  const controls = useDragControls();
  const url = useBlobUrl(item.blobKey);
  const cls = 'traj-card' + (item.status === 'unknown' ? ' unknown' : item.status === 'skipped' ? ' skipped' : '');
  return (
    <Reorder.Item value={item} dragListener={false} dragControls={controls} className={cls} whileDrag={{ scale: 1.04, zIndex: 5, boxShadow: '0 12px 30px rgba(0,0,0,.22)' }}>
      {url ? (
        <img src={url} alt="" draggable={false} onPointerDown={(e) => controls.start(e)} style={{ touchAction: 'none' }} />
      ) : (
        <div style={{ aspectRatio: '9 / 19' }} className="shimmer" />
      )}
      <div className="cap">
        {item.status === 'ok' && <b className="mono">{item.date}</b>}
        {item.status === 'ok' && item.time && <span className="tiny mono">{item.time}</span>}
        {item.status === 'unknown' && <b style={{ color: '#b26a00' }}>待选时间</b>}
        {item.status === 'skipped' && <b className="muted">已排到最后</b>}
        {item.status === 'pending' && <b className="muted">识别中…</b>}
        <div className="row" style={{ gap: 6, marginTop: 2 }}>
          {item.status !== 'ok' && <button className="chip" onClick={onPick}>选时间</button>}
          {item.status === 'unknown' && <button className="chip" onClick={onSkip}>排后</button>}
          {item.status === 'skipped' && <button className="chip" onClick={onRestore}>恢复</button>}
          {item.status === 'ok' && <button className="chip" onClick={onPick}>改</button>}
        </div>
      </div>
    </Reorder.Item>
  );
}

export default function Trajectory() {
  const batches = useStore((s) => s.batches);
  const activeId = useStore((s) => s.activeBatchId);
  const setView = useStore((s) => s.setView);
  const patchBatch = useStore((s) => s.patchBatch);
  const task = useStore((s) => s.task);
  const pickRef = useRef<HTMLInputElement>(null);
  const [editItem, setEditItem] = useState<TrajItem | null>(null);
  const [value, setValue] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

  const batch = useMemo(() => {
    return batches.find((b) => b.id === activeId && b.kind === 'trajectory');
  }, [batches, activeId]);

  useEffect(() => {
    if (batch) return;
    const t = useStore.getState().task;
    if (!t.running && (t.kind || t.tone !== 'idle' || t.step)) {
      useStore.getState().setTask({
        kind: null, label: '', step: '', done: 0, total: 0,
        running: false, paused: false, cancelRequested: false, tone: 'idle',
      });
    }
  }, [batch]);

  const images = batch?.images || [];
  const unknown = images.filter((i) => i.status === 'unknown').length;
  const skipped = images.filter((i) => i.status === 'skipped').length;
  const known = images.filter((i) => i.status === 'ok').length;
  const busy = task.kind === 'trajectory' && task.running;

  const onPick = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!arr.length) return;
    await importTrajectoryFiles(arr);
  };

  const openEditor = (it: TrajItem) => {
    setEditItem(it);
    setValue(`${it.date || new Date().toISOString().slice(0, 10)}T${it.time || '00:00'}`);
  };

  return (
    <div className="page">
      <div className="large-title">轨迹图</div>
      <div className="subtitle">
        把行程截图按时间排成能直接打印的 A4 页，每页 20 张、页内没有多余文字，打印出来直接附在报销单后面。只按截图里的日期排序，识别不到会让你自己选，不会乱排。
      </div>

      <input
        ref={pickRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = '';
        }}
      />

      {!batch && (
        <div className="card">
          <EmptyState
            icon={<IconRoute size={22} />}
            title="还没有导入轨迹截图"
            hint="从相册或「文件」里选截图，顺序不用管"
          />
          <button className="btn primary wide" onClick={() => pickRef.current?.click()}>
            <IconPlus size={18} /> 导入截图
          </button>
        </div>
      )}

      {batch && (
        <>
          <div className="card">
            <div className="row between">
              <div>
                <div style={{ fontWeight: 600 }}>{images.length} 张截图</div>
                <div className="tiny">
                  {busy ? `识别中 ${task.done}/${task.total || images.length}` : `${known} 张按时间排序${skipped ? ` · ${skipped} 张排在最后` : ''}${unknown ? ` · ${unknown} 张待选时间` : ''}`}
                </div>
              </div>
              <button className="btn ghost" onClick={() => pickRef.current?.click()}>继续导入</button>
            </div>
            {busy && (
              <div className="progress-track" style={{ marginTop: 10 }}>
                <i style={{ width: `${Math.round(((task.done || 0) / (task.total || images.length)) * 100)}%` }} />
              </div>
            )}
          </div>

          {unknown > 0 && (
            <div className="card" style={{ background: 'rgba(255,159,10,.08)' }}>
              <div className="row between">
                <div className="tiny" style={{ color: '#8a5300' }}>还有 {unknown} 张未识别，可选择时间，也可直接排到最后</div>
                <button className="chip" onClick={() => { if (batch) skipAllUnknown(batch.id); }}>全部排后</button>
              </div>
            </div>
          )}

          <Reorder.Group
            as="div"
            axis="y"
            className="traj-grid"
            values={images}
            onReorder={(next) => batch && patchBatch(batch.id, { images: next as TrajItem[] })}
          >
            {images.map((it) => (
              <TrajCard
                key={it.id}
                item={it}
                onPick={() => openEditor(it)}
                onSkip={() => batch && skipTraj(batch.id, it.id)}
                onRestore={() => batch && restoreTraj(batch.id, it.id)}
              />
            ))}
          </Reorder.Group>

          <div style={{ height: 90 }} />
          <button className="fab" onClick={() => setExportOpen(true)}>
            <IconRoute size={18} /> 导出
          </button>
        </>
      )}

      <Sheet open={!!editItem} onClose={() => setEditItem(null)} title="选择时间" lead="未识别时不会自动填，需要你自己确认">
        <div className="card">
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ width: '100%', border: 0, background: 'rgba(120,120,128,.1)', borderRadius: 12, padding: 12, fontSize: 16 }}
          />
        </div>
        <button
          className="btn primary wide"
          onClick={() => {
            if (batch && editItem && value) setTrajTime(batch.id, editItem.id, value);
            setEditItem(null);
          }}
        >
          保存
        </button>
      </Sheet>

      <Sheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="导出轨迹图"
        lead="默认导出 PDF，每页 20 张、页内无文字；需要交给别人编辑时可选 Word。没有识别时间的图会排在最后，不影响导出。"
      >
        {unknown > 0 && (
          <div className="card" style={{ background: 'rgba(255,159,10,.09)' }}>
            <div className="tiny" style={{ color: '#8a5300' }}>还有 {unknown} 张未识别，将排在最后</div>
          </div>
        )}
        <div className="row" style={{ gap: 10 }}>
          <motion.button
            className="btn primary grow"
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (batch) void exportTrajectory(batch.id, 'pdf');
              setExportOpen(false);
            }}
          >
            导出 PDF
          </motion.button>
          <motion.button
            className="btn grow"
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (batch) void exportTrajectory(batch.id, 'docx');
              setExportOpen(false);
            }}
          >
            导出 Word
          </motion.button>
        </div>
      </Sheet>
    </div>
  );
}
