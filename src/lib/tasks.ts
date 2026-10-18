import { useStore } from './store';

export interface JobCtx {
  setStep: (step: string) => void;
  setProgress: (done: number, total?: number) => void;
  setTone: (tone: 'run' | 'warn' | 'done') => void;
  cancelled: () => boolean;
}

interface Job {
  label: string;
  kind: 'invoice' | 'trajectory' | 'merge';
  run: (ctx: JobCtx) => Promise<void>;
}

const queue: Job[] = [];
let running = false;
let cancelFlag = false;
let cancelNotified = false;

function store() {
  return useStore.getState();
}

export function enqueue(job: Job): void {
  queue.push(job);
  store().setTask({ queued: Math.max(0, queue.length - (running ? 1 : 0)) });
  void pump();
}

export function cancelCurrent(): void {
  if (!running) return;
  cancelFlag = true;
  cancelNotified = true;
  store().setTask({ cancelRequested: true });
}

export function isRunning(): boolean {
  return running;
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift()!;
    cancelFlag = false;
    cancelNotified = false;
    store().setTask({
      kind: job.kind,
      label: job.label,
      step: '',
      done: 0,
      total: 0,
      running: true,
      paused: false,
      queued: queue.length,
      cancelRequested: false,
      tone: 'run',
    });
    const ctx: JobCtx = {
      setStep: (step) => store().setTask({ step }),
      setProgress: (done, total) => store().setTask({ done, total: total ?? store().task.total }),
      setTone: (tone) => store().setTask({ tone }),
      cancelled: () => cancelFlag,
    };
    try {
      await job.run(ctx);
      const t = store().task;
      const doneTask = store().task;
      const tone = doneTask.tone;
      store().setTask({
        running: false,
        tone: cancelFlag ? 'warn' : tone === 'warn' ? 'warn' : 'done',
        step: cancelFlag ? '已取消，保留已完成结果' : doneTask.step || '已完成',
        queued: queue.length,
      });
    } catch (err) {
      store().setTask({ running: false, tone: 'warn', step: '任务出错：' + (err as Error)?.message });
    }
  }
  running = false;
  store().setTask({ kind: null, running: false, queued: 0 });
  if (cancelNotified) cancelNotified = false;
}

export function resumeAfterVisible(): void {
  if (store().task.paused) store().setTask({ paused: false });
}
