import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import type { InvoiceItem } from './types';
import { getBlob } from './db';

export const A4W = 595.2756;
export const A4H = 841.8898;
const MM = 72 / 25.4;

export interface MergeResult {
  blob: Blob;
  pages: number;
}

/** 每页两张，200mm 宽，上下居中，5mm 边距，中间浅灰虚线。 */
export async function buildInvoiceA4(
  items: InvoiceItem[],
  perPage: 2 | 4 = 2,
  onProgress?: (done: number) => void,
): Promise<MergeResult> {
  const out = await PDFDocument.create();
  out.setTitle('发票拼版');
  out.setProducer('报销助手');

  const contentW = 200 * MM;
  const halfH = A4H / 2;
  let done = 0;
  let pending: { doc: PDFDocument; order: number }[] = [];

  for (const item of items) {
    const blob = await getBlob(item.blobKey);
    if (!blob) {
      done++;
      onProgress?.(done);
      continue;
    }
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      pending.push({ doc: src, order: done });
    } catch {
      /* 损坏或加密，跳过 */
    }
    done++;
    onProgress?.(done);
  }

  const flat: { doc: PDFDocument; pageIndex: number }[] = [];
  for (const p of pending) {
    for (let i = 0; i < p.doc.getPageCount(); i++) flat.push({ doc: p.doc, pageIndex: i });
  }

  const grey = rgb(0.62, 0.62, 0.62);

  const step = perPage;
  const cellW = A4W / 2;
  const cellH = A4H / 2;
  const pad = 4.5 * MM;

  for (let i = 0; i < flat.length; i += step) {
    const page = out.addPage([A4W, A4H]);
    for (let s = 0; s < step; s++) {
      const entry = flat[i + s];
      if (!entry) break;
      const srcPage = entry.doc.getPage(entry.pageIndex);
      const w = srcPage.getWidth();
      const h = srcPage.getHeight();
      let drawW: number;
      let drawH: number;
      let x: number;
      let y: number;

      if (step === 2) {
        const maxH = halfH - 34 * MM;
        let scale = contentW / w;
        if (h * scale > maxH) scale = maxH / h;
        drawW = w * scale;
        drawH = h * scale;
        x = (A4W - drawW) / 2;
        const centerY = s === 0 ? halfH * 1.5 : halfH * 0.5;
        y = centerY - drawH / 2;
      } else {
        const col = s % 2;
        const row = Math.floor(s / 2);
        const availW = cellW - pad * 2;
        const availH = cellH - pad * 2;
        const cellBottom = A4H - (row + 1) * cellH;
        // 旋转后长边竖直朝内：0/2 逆时针 90，1/3 顺时针 90
        const k = Math.min(availW / h, availH / w);
        const visW = h * k;
        const visH = w * k;
        const X = col * cellW + (cellW - visW) / 2;
        const Y = cellBottom + (cellH - visH) / 2;
        const ccw = s % 2 === 0;
        const embedded0 = await out.embedPage(srcPage);
        page.drawPage(embedded0, {
          x: ccw ? X + visW : X,
          y: ccw ? Y : Y + visH,
          width: visH,
          height: visW,
          rotate: degrees(ccw ? 90 : -90),
        });
        continue;
      }

      const embedded = await out.embedPage(srcPage);
      page.drawPage(embedded, { x, y, width: drawW, height: drawH });
    }
    page.drawLine({
      start: { x: 8 * MM, y: halfH },
      end: { x: A4W - 8 * MM, y: halfH },
      thickness: 0.4,
      color: grey,
      dashArray: [3, 4],
    });
    if (step === 4) {
      page.drawLine({
        start: { x: A4W / 2, y: 8 * MM },
        end: { x: A4W / 2, y: A4H - 8 * MM },
        thickness: 0.4,
        color: grey,
        dashArray: [3, 4],
      });
    }
  }

  if (out.getPageCount() === 0) {
    const page = out.addPage([A4W, A4H]);
    const font = await out.embedFont(StandardFonts.Helvetica);
    page.drawText('', { x: 40, y: 40, size: 10, font });
  }

  const bytes = await out.save();
  return { blob: new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), pages: out.getPageCount() };
}
