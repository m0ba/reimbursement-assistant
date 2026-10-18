import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../lib/store';
import { cancelCurrent } from '../lib/tasks';
import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';

export function Ring({ value, tone = 'run', size = 18 }: { value: number; tone?: string; size?: number }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={'ring ' + (tone === 'done' ? 'done' : tone === 'warn' ? 'warn' : '')} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="2.4" />
        <circle
          className="bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        />
      </svg>
    </span>
  );
}

export function TaskBadge() {
  const task = useStore((s) => s.task);
  const [open, setOpen] = useState(false);
  const [doneHidden, setDoneHidden] = useState(false);
  useEffect(() => {
    if (task.running) {
      setDoneHidden(false);
      return;
    }
    if (task.tone === 'done') {
      const t = window.setTimeout(() => setDoneHidden(true), 4000);
      return () => window.clearTimeout(t);
    }
    setDoneHidden(false);
  }, [task.running, task.tone, task.updatedAt]);
  const visible = task.running || task.tone === 'warn' || (task.tone === 'done' && !doneHidden);
  const pct = task.total > 0 ? task.done / task.total : task.running ? 0.15 : 1;
  const text = task.running
    ? task.step || task.label
    : task.tone === 'warn'
      ? task.step || '还有未处理项'
      : '处理完成';

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.button
            className="taskpill inline"
            layout
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={() => setOpen(true)}
          >
            <Ring value={pct} tone={task.tone === 'warn' ? 'warn' : task.running ? 'run' : 'done'} />
            <span>{text}</span>
          </motion.button>
        )}
      </AnimatePresence>

      <Sheet open={open} onClose={() => setOpen(false)} title="后台任务" lead="同一时间只运行一个任务，可随时取消；已完成的结果都会保留。">
        <div className="card">
          <div className="row between">
            <div>
              <div style={{ fontWeight: 600 }}>{task.label || '空闲'}</div>
              <div className="tiny">{task.step || '没有正在运行的任务'}</div>
            </div>
            <Ring value={pct} size={30} tone={task.tone === 'warn' ? 'warn' : task.running ? 'run' : 'done'} />
          </div>
          <div className="divider" />
          <div className="row between tiny">
            <span>进度</span>
            <span className="mono">{task.total ? `${task.done}/${task.total}` : '—'}</span>
          </div>
          <div className="progress-track" style={{ marginTop: 8 }}>
            <i style={{ width: `${Math.round(pct * 100)}%` }} />
          </div>
        </div>
        {task.running && (
          <button className="btn wide danger" style={{ background: 'rgba(255,59,48,.1)' }} onClick={() => { cancelCurrent(); setOpen(false); }}>
            取消当前任务
          </button>
        )}
      </Sheet>
    </>
  );
}
