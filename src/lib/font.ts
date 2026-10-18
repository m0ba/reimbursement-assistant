import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument } from 'pdf-lib';

let cache: ArrayBuffer | null = null;

export async function loadCjkBytes(): Promise<ArrayBuffer> {
  if (cache) return cache;
  const res = await fetch('/fonts/reimb-cjk.ttf');
  cache = await res.arrayBuffer();
  return cache;
}

export async function embedCjk(doc: PDFDocument) {
  doc.registerFontkit(fontkit as any);
  const bytes = await loadCjkBytes();
  return doc.embedFont(bytes, { subset: true });
}
