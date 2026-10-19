import { createWorker, type Worker } from 'tesseract.js';
import { Capacitor } from '@capacitor/core';

let worker: Worker | null = null;
let workerModel = '';

export const OCR_LANG: Record<string, string> = {
  'eng-fast': 'eng',
  'chi-sim-fast': 'chi_sim',
};

export const OCR_FILE: Record<string, string> = {
  'eng-fast': 'eng.traineddata.gz',
  'chi-sim-fast': 'chi_sim.traineddata.gz',
};

const NATIVE = typeof window !== 'undefined' && Capacitor.isNativePlatform();
const ORIGIN = typeof location !== 'undefined' ? location.origin : '';
const MODEL_BASE: Record<string, string> = { 'eng-fast': 'eng', 'chi-sim-fast': 'chi_sim' };

/** APK 里 aapt 会解压 .gz 并去掉后缀，原生端要用未压缩文件名。 */
function modelUrl(modelId: string): string {
  const base = MODEL_BASE[modelId] || 'eng';
  return NATIVE ? `/tessdata/${base}.traineddata` : `/tessdata/${base}.traineddata.gz`;
}

export async function ensureWorker(modelId: string): Promise<Worker> {
  const lang = OCR_LANG[modelId] || 'eng';
  if (worker && workerModel === modelId) return worker;
  if (worker) {
    try {
      await worker.terminate();
    } catch {
      /* ignore */
    }
    worker = null;
  }
  const make = (gzip: boolean) =>
    createWorker(lang, 1, {
      workerPath: `${ORIGIN}/tesseract/worker.min.js`,
      corePath: `${ORIGIN}/tesseract`,
      langPath: `${ORIGIN}/tessdata`,
      gzip,
      logger: () => {},
    });
  let w: Worker;
  try {
    w = await make(!NATIVE);
  } catch {
    w = await make(NATIVE);
  }
  await w.setParameters({
    tessedit_char_whitelist: '0123456789-',
    preserve_interword_spaces: '1',
  });
  worker = w;
  workerModel = modelId;
  return w;
}

let preloaded = '';

/** 启动时预热：先把模型读进缓存，再建 worker，避免第一次识别卡住。 */
export async function preloadOcr(
  modelId: string,
  onProgress?: (pct: number, label: string) => void,
): Promise<void> {
  if (preloaded === modelId) {
    onProgress?.(1, '识别模型已就绪');
    return;
  }
  try {
    onProgress?.(0.05, '正在准备识别模型');
    await ensureWorker(modelId);
    preloaded = modelId;
    onProgress?.(1, '识别模型已就绪');
  } catch {
    onProgress?.(1, '准备失败，可在设置里重试');
  }
}

export async function disposeOcr(): Promise<void> {
  if (worker) {
    try {
      await worker.terminate();
    } catch {
      /* ignore */
    }
  }
  worker = null;
  workerModel = '';
}

export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

/** 只裁应用自己的头部条：跳掉状态栏，取右侧日期区。 */
function headerCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const x0 = Math.round(W * 0.5);
  const y0 = Math.round(H * 0.052);
  const x1 = Math.round(W * 0.995);
  const y1 = Math.round(H * 0.15);
  const sw = x1 - x0;
  const sh = y1 - y0;
  const scale = Math.min(4, Math.max(2, 900 / sw));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x0, y0, sw, sh, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const v = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const b = v < 150 ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = b;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

export interface HeaderResult {
  date?: string;
  time?: string;
  raw: string;
}

function parseDate(text: string): { date?: string; time?: string } {
  const t = text.replace(/\s+/g, ' ');
  let m = t.match(/(20\d{2})\s*[-年./]\s*(\d{1,2})\s*[-月./]\s*(\d{1,2})/);
  if (!m) m = t.match(/(20\d{2})(\d{2})(\d{2})/);
  if (!m) return {};
  const date = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  const mon = Number(m[2]);
  const day = Number(m[3]);
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return {};
  return { date };
}

export async function readHeaderTime(blob: Blob, modelId: string): Promise<HeaderResult> {
  const img = await loadImage(blob);
  const canvas = headerCanvas(img);
  const w = await ensureWorker(modelId);
  let raw = '';
  try {
    const res = await w.recognize(canvas);
    raw = res.data.text || '';
  } catch {
    raw = '';
  }
  const parsed = parseDate(raw);
  return { date: parsed.date, time: parsed.time, raw };
}
