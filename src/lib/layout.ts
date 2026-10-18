import { PDFDocument, rgb } from 'pdf-lib';
import { A4H, A4W } from './merge';
import { getBlob } from './db';
import type { TrajItem } from './types';
import { embedCjk } from './font';

const MM = 72 / 25.4;
const COLS = 5;
const ROWS = 4;
const PER_PAGE = COLS * ROWS;

async function imageBytes(blob: Blob): Promise<{ kind: 'jpg' | 'png'; bytes: Uint8Array }> {
  if (blob.type.includes('png')) return { kind: 'png', bytes: new Uint8Array(await blob.arrayBuffer()) };
  return { kind: 'jpg', bytes: new Uint8Array(await blob.arrayBuffer()) };
}

export function sortTrajectory(items: TrajItem[]): TrajItem[] {
  const known = items.filter((i) => i.status === 'ok' && i.date);
  const unknown = items.filter((i) => !(i.status === 'ok' && i.date));
  known.sort((a, b) => (a.date! + (a.time || '00:00')).localeCompare(b.date! + (b.time || '00:00')));
  return [...known, ...unknown];
}

export async function buildTrajectoryPdf(items: TrajItem[], onProgress?: (done: number) => void): Promise<{ blob: Blob; pages: number }> {
  const ordered = items;
  const doc = await PDFDocument.create();
  doc.setTitle('轨迹图');
  doc.setProducer('报销助手');

  const marginX = 8 * MM;
  const marginY = 8 * MM;
  const gap = 2.5 * MM;
  const cellW = (A4W - marginX * 2 - gap * (COLS - 1)) / COLS;
  const cellH = (A4H - marginY * 2 - gap * (ROWS - 1)) / ROWS;

  let page = doc.addPage([A4W, A4H]);
  let idx = 0;
  for (; idx < ordered.length; idx++) {
    const pos = idx % PER_PAGE;
    if (idx > 0 && pos === 0) page = doc.addPage([A4W, A4H]);
    const col = pos % COLS;
    const row = Math.floor(pos / COLS);
    const blob = await getBlob(ordered[idx].blobKey);
    if (blob) {
      try {
        const { kind, bytes } = await imageBytes(blob);
        const img = kind === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const s = Math.min(cellW / img.width, cellH / img.height);
        const w = img.width * s;
        const h = img.height * s;
        const x = marginX + col * (cellW + gap) + (cellW - w) / 2;
        const y = A4H - marginY - (row + 1) * cellH - row * gap + (cellH - h) / 2;
        page.drawImage(img, { x, y, width: w, height: h });
      } catch {
        /* skip broken image */
      }
    }
    onProgress?.(idx + 1);
  }

  if (ordered.length === 0) {
    const font = await embedCjk(doc);
    page.drawText('暂无图片', { x: 40, y: 40, size: 12, font, color: rgb(0.5, 0.5, 0.5) });
  }

  const bytes = await doc.save();
  return { blob: new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), pages: doc.getPageCount() };
}
