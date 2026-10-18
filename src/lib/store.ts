import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Batch, LibraryFile, Settings, TaskState } from './types';

export const OCR_MODELS = [
  {
    id: 'eng-fast',
    name: '内置 · 数字与英文（快速）',
    file: 'eng.traineddata.gz',
    lang: 'eng',
    mb: 10,
    builtin: true,
    source: '程序内置目录 /models',
    note: '默认模型，只识别日期数字，速度最快，不可删除',
  },
  {
    id: 'chi-sim-fast',
    name: '可选 · 简体中文 + 数字',
    file: 'chi_sim.traineddata.gz',
    lang: 'chi_sim',
    mb: 19,
    builtin: false,
    source: '程序内置目录 /models',
    note: '可辅助识别中文地名，体积更大、速度略慢',
  },
];

interface Store {
  ready: boolean;
  view: 'home' | 'invoices' | 'trajectory' | 'materials' | 'settings';
  activeBatchId: string | null;
  batches: Batch[];
  files: LibraryFile[];
  settings: Settings;
  task: TaskState;
  toast: string | null;
  setView: (v: Store['view'], batchId?: string | null) => void;
  addBatch: (b: Batch) => void;
  patchBatch: (id: string, patch: Partial<Batch> | ((b: Batch) => Partial<Batch>)) => void;
  removeBatch: (id: string) => void;
  addFile: (f: LibraryFile) => void;
  patchFile: (id: string, patch: Partial<LibraryFile>) => void;
  removeFile: (id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setTask: (patch: Partial<TaskState>) => void;
  showToast: (msg: string) => void;
  resetAll: () => void;
}

const emptyTask: TaskState = {
  kind: null,
  step: '',
  label: '',
  done: 0,
  total: 0,
  running: false,
  paused: false,
  queued: 0,
  cancelRequested: false,
  tone: 'idle',
  updatedAt: 0,
};

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ready: false,
      view: 'home',
      activeBatchId: null,
      batches: [],
      files: [],
      settings: { ocrModelId: 'eng-fast', installedModels: ['eng-fast'], lastInvoiceMode: 'info', perPage: 2, introSeen: false, trajPerPage: 20 },
      task: emptyTask,
      toast: null,
      setView: (view, batchId) => {
        if (typeof window !== 'undefined') window.scrollTo(0, 0);
        set((s) => ({ view, activeBatchId: batchId === undefined ? s.activeBatchId : batchId }));
      },
      addBatch: (b) => set((s) => ({ batches: [b, ...s.batches] })),
      patchBatch: (id, patch) =>
        set((s) => ({
          batches: s.batches.map((b) => (b.id === id ? { ...b, ...(typeof patch === 'function' ? patch(b) : patch) } : b)),
        })),
      removeBatch: (id) => set((s) => ({ batches: s.batches.filter((b) => b.id !== id) })),
      addFile: (f) => set((s) => ({ files: [f, ...s.files] })),
      patchFile: (id, patch) =>
        set((s) => ({ files: s.files.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      removeFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setTask: (patch) => set((s) => ({ task: { ...s.task, ...patch, updatedAt: Date.now() } })),
      showToast: (msg) => {
        set({ toast: msg });
        window.setTimeout(() => {
          if (get().toast === msg) set({ toast: null });
        }, 2600);
      },
      resetAll: () =>
        set({
          batches: [],
          files: [],
          activeBatchId: null,
          view: 'home',
          settings: { ocrModelId: 'eng-fast', installedModels: ['eng-fast'], lastInvoiceMode: 'info', perPage: 2, introSeen: true, trajPerPage: 20 },
          task: emptyTask,
        }),
    }),
    {
      name: 'reimb-store-v1',
      partialize: (s) => ({ batches: s.batches, files: s.files, settings: s.settings }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<Store> & { settings?: Partial<Settings> };
        return {
          ...current,
          ...p,
          settings: { ...current.settings, ...(p.settings || {}) },
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.ready = true;
      },
    },
  ),
);

export const taskBusy = () => useStore.getState().task.running;
