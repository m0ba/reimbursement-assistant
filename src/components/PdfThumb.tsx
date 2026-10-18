import { useEffect, useState } from 'react';
import { getBlob } from '../lib/db';
import { openPdf, renderPageToCanvas } from '../lib/pdfdoc';

export function PdfThumb({ blobKey, maxWidth = 420 }: { blobKey: string; maxWidth?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const blob = await getBlob(blobKey);
      if (!blob) return;
      try {
        const doc = await openPdf(await blob.arrayBuffer());
        const c = await renderPageToCanvas(doc, 1, 1);
        const scale = Math.min(1.4, maxWidth / c.width);
        const out = document.createElement('canvas');
        out.width = Math.round(c.width * scale);
        out.height = Math.round(c.height * scale);
        out.getContext('2d')!.drawImage(c, 0, 0, out.width, out.height);
        const dataUrl = out.toDataURL('image/jpeg', 0.82);
        if (alive) setUrl(dataUrl);
        doc.destroy();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [blobKey, maxWidth]);

  if (!url) return <div className="pdfpage shimmer" style={{ aspectRatio: '1 / 1.414', height: 'auto' }} />;
  return <img className="pdfpage" src={url} alt="预览" />;
}

export function useBlobUrl(key?: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    let created: string | null = null;
    (async () => {
      const blob = await getBlob(key);
      if (!blob) return;
      created = URL.createObjectURL(blob);
      if (alive) setUrl(created);
    })();
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [key]);
  return url;
}
