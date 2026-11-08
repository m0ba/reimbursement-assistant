import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import type { InvoiceItem } from './types';
import { getBlob } from './db';
import { openPdf, renderPageToCanvas } from './pdfdoc';

export const A4W = 595.2756;
export const A4H = 841.8898;
const MM = 72 / 25.4;

export interface MergeResult {
  blob: Blob;
  pages: number;
}

interface ImagePage {
  png: Uint8Array;
  width: number;
  height: number;
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('无法生成发票预览');
  return new Uint8Array(await blob.arrayBuffer());
}

/** 少数发票页缺少 pdf-lib 能读取的 Contents，但用 PDF.js 仍可正常显示。 */
async function buildInvoiceA4FromImages(
  items: InvoiceItem[],
  perPage: 2 | 4,
  onProgress?: (done: number) => void,
): Promise<MergeResult> {
  const out = await PDFDocument.create();
  out.setTitle('发票拼版');
  out.setProducer('报销助手');
  const flat: ImagePage[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex];
    const blob = await getBlob(item.blobKey);
    if (blob) {
      try {
        const doc = await openPdf(await blob.arrayBuffer());
        for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
          const canvas = await renderPageToCanvas(doc, pageNo, 2);
          flat.push({
            png: await canvasPng(canvas),
            width: canvas.width,
            height: canvas.height,
          });
          canvas.width = 1;
          canvas.height = 1;
        }
        await doc.destroy();
      } catch {
        /* 无法渲染的文件跳过，保留其余发票 */
      }
    }
    onProgress?.(itemIndex + 1);
  }
  if (!flat.length) throw new Error('无法读取这些发票的页面内容');

  const grey = rgb(0.62, 0.62, 0.62);
  const halfH = A4H / 2;
  const cellW = A4W / 2;
  const cellH = A4H / 2;
  const pad = 4.5 * MM;

  for (let index = 0; index < flat.length; index += perPage) {
    const page = out.addPage([A4W, A4H]);
    for (let slot = 0; slot < perPage; slot += 1) {
      const entry = flat[index + slot];
      if (!entry) break;
      const image = await out.embedPng(entry.png);
      let x: number;
      let y: number;
      let width: number;
      let height: number;
      let rotate = degrees(0);

      if (perPage === 2) {
        const maxH = halfH - 34 * MM;
        const contentW = 200 * MM;
        let scale = contentW / entry.width;
        if (entry.height * scale > maxH) scale = maxH / entry.height;
        width = entry.width * scale;
        height = entry.height * scale;
        x = (A4W - width) / 2;
        const centerY = slot === 0 ? halfH * 1.5 : halfH * 0.5;
        y = centerY - height / 2;
      } else {
        const col = slot % 2;
        const row = Math.floor(slot / 2);
        const availableW = cellW - pad * 2;
        const availableH = cellH - pad * 2;
        const cellBottom = A4H - (row + 1) * cellH;
        const scale = Math.min(availableW / entry.height, availableH / entry.width);
        width = entry.height * scale;
        height = entry.width * scale;
        const left = col * cellW + (cellW - width) / 2;
        const bottom = cellBottom + (cellH - height) / 2;
        const ccw = slot % 2 === 0;
        x = ccw ? left + width : left;
        y = ccw ? bottom : bottom + height;
        rotate = degrees(ccw ? 90 : -90);
      }
      page.drawImage(image, { x, y, width, height, rotate });
    }
    page.drawLine({
      start: { x: 8 * MM, y: halfH },
      end: { x: A4W - 8 * MM, y: halfH },
      thickness: 0.4,
      color: grey,
      dashArray: [3, 4],
    });
    if (perPage === 4) {
      page.drawLine({
        start: { x: A4W / 2, y: 8 * MM },
        end: { x: A4W / 2, y: A4H - 8 * MM },
        thickness: 0.4,
        color: grey,
        dashArray: [3, 4],
      });
    }
  }

  if (out.getPageCount() === 0) out.addPage([A4W, A4H]);
  const bytes = await out.save();
  return { blob: new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), pages: out.getPageCount() };
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

  try {
    const bytes = await out.save();
    return { blob: new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), pages: out.getPageCount() };
  } catch {
    return buildInvoiceA4FromImages(items, perPage, onProgress);
  }
}
