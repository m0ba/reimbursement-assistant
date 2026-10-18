import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

export async function openPdf(data: ArrayBuffer): Promise<PdfDoc> {
  return pdfjsLib.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    cMapUrl: '/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/standard_fonts/',
  }).promise;
}

export interface TextLine {
  text: string;
  x: number;
  y: number;
  size: number;
}

export async function pageLines(doc: PdfDoc, pageNo = 1): Promise<TextLine[]> {
  const page = await doc.getPage(pageNo);
  const content = await page.getTextContent();
  const out: TextLine[] = [];
  for (const item of content.items as any[]) {
    if (!item.str || !item.str.trim()) continue;
    out.push({
      text: item.str.trim(),
      x: item.transform[4],
      y: item.transform[5],
      size: Math.abs(item.transform[3]) || 10,
    });
  }
  return out;
}

export async function pageSize(doc: PdfDoc, pageNo = 1): Promise<{ w: number; h: number }> {
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale: 1 });
  return { w: vp.width, h: vp.height };
}

/** 按纵坐标聚行、按横坐标排序后逐字拼接，兼容“一字一个 item”的票面。 */
export async function pageText(doc: PdfDoc, pageNo = 1): Promise<string> {
  const page = await doc.getPage(pageNo);
  const content = await page.getTextContent();
  const rows = new Map<number, { x: number; s: string }[]>();
  for (const item of content.items as any[]) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5] / 2.5) * 2.5;
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y)!.push({ x: item.transform[4], s: item.str });
  }
  return [...rows.keys()]
    .sort((a, b) => b - a)
    .map((y) => rows.get(y)!.sort((a, b) => a.x - b.x).map((v) => v.s).join(''))
    .join('\n');
}

export async function renderPageToCanvas(doc: PdfDoc, pageNo: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
  return canvas;
}
