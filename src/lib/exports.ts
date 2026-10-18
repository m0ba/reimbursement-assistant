import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, ImageRun, AlignmentType, BorderStyle } from 'docx';
import { PDFDocument, rgb } from 'pdf-lib';
import { A4H, A4W } from './merge';
import { embedCjk } from './font';
import { getBlob } from './db';
import type { InvoiceItem, TrajItem } from './types';
import { sortTrajectory } from './layout';

const MM = 72 / 25.4;

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function invoiceCsv(items: InvoiceItem[]): string {
  const head = ['类型', '发票号码', '开票日期', '销售方', '行程', '金额', '校验'];
  const rows = items.map((i) => [
    i.category || '',
    i.number || '',
    i.date || '',
    i.seller || '',
    routeText(i),
    i.amount?.toFixed(2) || '',
    verifyText(i),
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function routeText(i: InvoiceItem): string {
  if (!i.routeFrom || !i.routeTo) return '';
  const time = i.departAt ? ` ${i.departAt.slice(5).replace('-', '/')}` : '';
  return `${i.routeFrom}→${i.routeTo}${time}`;
}

export function verifyText(i: InvoiceItem): string {
  if (i.verify === 'ok') return '一致';
  if (i.verify === 'mismatch') return '不一致';
  if (i.verify === 'unavailable') return '无法校验';
  return '';
}

export function invoicePlainText(items: InvoiceItem[]): string {
  const head = ['类型', '发票号码', '开票日期', '销售方', '行程', '金额', '校验'];
  const rows = items.map((i) => [
    i.category || '',
    i.number || '',
    i.date || '',
    i.seller || '',
    routeText(i),
    i.amount?.toFixed(2) || '',
    verifyText(i),
  ]);
  return [head, ...rows].map((r) => r.join('\t')).join('\n');
}

export async function buildInvoiceInfoPdf(items: InvoiceItem[], batchName: string): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.setTitle('发票信息表');
  const font = await embedCjk(doc);
  const page = doc.addPage([A4W, A4H]);

  const marginX = 14 * MM;
  const top = A4H - 16 * MM;
  const cols = [
    { key: 'idx', title: '序号', w: 30 },
    { key: 'cat', title: '类型', w: 44 },
    { key: 'num', title: '发票号码', w: 118, size: 8.0 },
    { key: 'date', title: '开票日期', w: 64 },
    { key: 'seller', title: '销售方', w: 80 },
    { key: 'route', title: '行程', w: 126 },
    { key: 'amount', title: '金额（元）', w: 64 },
    { key: 'verify', title: '校验', w: 40 },
  ];
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const scaleX = (A4W - marginX * 2) / totalW;

  let y = top;
  page.drawText('发票信息表', { x: marginX, y, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  y -= 18;
  page.drawText(batchName, { x: marginX, y, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  y -= 16;

  const rowH = 20;
  const line = rgb(0.8, 0.8, 0.8);
  const drawRow = (cells: string[], bold = false, shade = false) => {
    if (shade) page.drawRectangle({ x: marginX, y: y - rowH + 5, width: A4W - marginX * 2, height: rowH, color: rgb(0.96, 0.96, 0.97) });
    let x = marginX;
    cells.forEach((text, i) => {
      const c = cols[i];
      const w = c.w * scaleX;
      const size = bold ? 9 : (c as any).size || 8.6;
      let t = text;
      let cut = false;
      while (t.length > 1 && font.widthOfTextAtSize(t, size) > w - 8) {
        t = t.slice(0, -1);
        cut = true;
      }
      if (cut) t = t.slice(0, -1) + '…';
      page.drawText(t, { x: x + 3, y: y - rowH + 10, size, font, color: rgb(0.15, 0.15, 0.15) });
      x += w;
    });
    page.drawLine({ start: { x: marginX, y: y - rowH + 5 }, end: { x: A4W - marginX, y: y - rowH + 5 }, thickness: 0.4, color: line });
    y -= rowH;
  };

  drawRow(cols.map((c) => c.title), true, true);
  items.forEach((it, idx) => {
    drawRow([
      String(idx + 1),
      it.category || '—',
      it.number || '—',
      it.date || '—',
      it.seller || '—',
      routeText(it) || '—',
      it.amount !== undefined ? it.amount.toFixed(2) : '—',
      verifyText(it) || '—',
    ]);
  });

  const cats = ['住宿', '火车', '打车', '其他'] as const;
  y -= 10;
  for (const c of cats) {
    const sum = items.filter((i) => i.category === c && i.amount !== undefined).reduce((s, i) => s + (i.amount || 0), 0);
    page.drawText(`${c}小计`, { x: marginX, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(sum.toFixed(2), { x: A4W - marginX - 60, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 15;
  }
  const total = items.reduce((s, i) => s + (i.amount || 0), 0);
  page.drawText('合计', { x: marginX, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(total.toFixed(2), { x: A4W - marginX - 60, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });

  y -= 26;
  const ok = items.filter((i) => i.verify === 'ok').length;
  const bad = items.filter((i) => i.verify === 'mismatch').length;
  const na = items.filter((i) => i.verify === 'unavailable' || i.verify === 'unknown').length;
  if (ok + bad + na > 0) {
    page.drawText(`校验结果：${ok} 张一致，${bad} 张不一致，${na} 张无法校验`, {
      x: marginX, y, size: 8.5, font, color: rgb(0.45, 0.45, 0.45),
    });
  }

  const bytes = await doc.save();
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}

async function imageMeta(blob: Blob): Promise<{ data: Uint8Array; w: number; h: number; type: 'jpg' | 'png' }> {
  const data = new Uint8Array(await blob.arrayBuffer());
  const type = blob.type.includes('png') ? 'png' : 'jpg';
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('img'));
      img.src = url;
    });
    return { data, w: img.naturalWidth, h: img.naturalHeight, type };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function buildTrajectoryDocx(items: TrajItem[]): Promise<Blob> {
  const ordered = items;
  const perPage = 20;
  const cols = 5;
  const rows = 4;
  const cellWpx = 140;
  const cellHpx = 250;
  const pages: Table[] = [];

  for (let p = 0; p * perPage < Math.max(ordered.length, 1); p++) {
    const slice = ordered.slice(p * perPage, (p + 1) * perPage);
    if (slice.length === 0 && p > 0) break;
    const trs: TableRow[] = [];
    for (let r = 0; r < rows; r++) {
      const cells: TableCell[] = [];
      for (let c = 0; c < cols; c++) {
        const item = slice[r * cols + c];
        let child: Paragraph = new Paragraph({ text: '', alignment: AlignmentType.CENTER });
        if (item) {
          const blob = await getBlob(item.blobKey);
          if (blob) {
            try {
              const meta = await imageMeta(blob);
              const s = Math.min(cellWpx / meta.w, cellHpx / meta.h);
              child = new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: meta.data,
                    type: meta.type,
                    transformation: { width: Math.round(meta.w * s), height: Math.round(meta.h * s) },
                  }),
                ],
              });
            } catch {
              child = new Paragraph({ text: '' });
            }
          }
        }
        cells.push(
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            margins: { top: 40, bottom: 40, left: 40, right: 40 },
            children: [child],
          }),
        );
      }
      trs.push(new TableRow({ children: cells, height: { value: 3800, rule: 'atLeast' } as any }));
    }
    pages.push(
      new Table({
        rows: trs,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
        },
      }),
    );
  }

  const children: Paragraph[] = [];
  pages.forEach((t, i) => {
    if (i > 0) children.push(new Paragraph({ children: [], pageBreakBefore: true }));
    children.push(new Paragraph({ children: [], spacing: { before: 0, after: 0 } }));
  });

  const doc = new Document({
    sections: pages.map((t) => ({
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 454, bottom: 454, left: 454, right: 454 },
        },
      },
      children: [t],
    })),
  });
  const blob = await Packer.toBlob(doc);
  return blob;
}
