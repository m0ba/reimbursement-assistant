import { useEffect, useState } from 'react';
import { getBlob } from '../lib/db';
import { openPdf, renderPageToCanvas } from '../lib/pdfdoc';

/** 横向滑动的 A4 页面预览，一屏两张。 */
export function PdfPages({ blobKey, max = 12 }: { blobKey: string; max?: number }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setUrls([]);
    (async () => {
      const blob = await getBlob(blobKey);
      if (!blob) return;
      try {
        const doc = await openPdf(await blob.arrayBuffer());
        const out: string[] = [];
        for (let i = 1; i <= Math.min(doc.numPages, max); i++) {
          const c = await renderPageToCanvas(doc, i, 0.62);
          out.push(c.toDataURL('image/jpeg', 0.82));
        }
        doc.destroy();
        if (alive) setUrls(out);
      } catch {
        /* ignore */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [blobKey, max]);

  if (loading && urls.length === 0) {
    return (
      <div className="pdf-pages">
        {[0, 1].map((i) => (
          <div key={i} className="pdf-page-skel shimmer" />
        ))}
      </div>
    );
  }

  return (
    <div className="pdf-pages">
      {urls.map((src, i) => (
        <img key={i} src={src} className="pdf-page" alt={`第 ${i + 1} 页`} draggable={false} />
      ))}
    </div>
  );
}
