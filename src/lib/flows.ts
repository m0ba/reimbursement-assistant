import { putBlob, uid, stamp } from './db';
import { deleteBlob, getBlob as getBlob2 } from './db';
import { useStore } from './store';
import type { Batch, InvoiceItem, InvoiceMode, TrajItem } from './types';
import { buildInvoiceA4 } from './merge';
import { openPdf, pageText } from './pdfdoc';
import { parseInvoiceText } from './parse';
import { verifyInvoiceQr } from './qr';
import { readHeaderTime } from './ocr';
import { enqueue } from './tasks';
import { buildTrajectoryPdf } from './layout';
import { buildInvoiceInfoPdf, buildTrajectoryDocx, invoiceCsv } from './exports';
import { getBlob } from './db';

const s = () => useStore.getState();

export function categoryOf(i: InvoiceItem) {
  return i.category || '其他';
}

export async function importInvoiceFiles(files: File[]): Promise<Batch> {
  const sorted = [...files].sort((a, b) => a.lastModified - b.lastModified);
  const batch: Batch = {
    id: uid('inv'),
    kind: 'invoice',
    createdAt: Date.now(),
    name: `${stamp()}_发票批次`,
    layoutDone: false,
    perPage: s().settings.perPage,
    invoices: [],
  };
  const items: InvoiceItem[] = [];
  for (const f of sorted) {
    const key = `blob_${uid('f')}`;
    await putBlob(key, f);
    items.push({
      id: uid('i'),
      fileName: f.name,
      blobKey: key,
      lastModified: f.lastModified,
      status: 'pending',
      pages: 1,
    });
  }
  batch.invoices = items;
  s().addBatch(batch);
  s().setView('invoices', batch.id);
  startMerge(batch.id);
  return batch;
}

function startMerge(batchId: string) {
  enqueue({
    kind: 'merge',
    label: '发票拼版',
    run: async (ctx) => {
      const batch = s().batches.find((b) => b.id === batchId);
      if (!batch?.invoices) return;
      const items = batch.invoices;
      const per = batch.perPage ?? 2;
      ctx.setStep('正在拼版');
      ctx.setProgress(0, items.length);
      const res = await buildInvoiceA4(items, per, (n) => ctx.setProgress(n, items.length));
      const key = `blob_${uid('pdf')}`;
      await putBlob(key, res.blob);
      const prevKey = s().batches.find((b) => b.id === batchId)?.layoutKey;
      if (prevKey) await deleteBlob(prevKey);
      s().patchBatch(batchId, { layoutDone: true, layoutKey: key, layoutPages: res.pages });
      ctx.setStep('拼版已就绪');
    },
  });
}

export function applyInvoiceMode(batchId: string, mode: InvoiceMode) {
  s().patchBatch(batchId, { mode });
  s().setSettings({ lastInvoiceMode: mode });
  if (mode === 'layout') return;
  startParse(batchId, mode === 'verify');
}

export function regenerateLayout(batchId: string) {
  s().patchBatch(batchId, { layoutDone: false });
  startMerge(batchId);
}

export function changePerPage(batchId: string, perPage: 2 | 4) {
  s().setSettings({ perPage });
  s().patchBatch(batchId, { perPage });
  startMerge(batchId);
}

export function startParse(batchId: string, verify: boolean) {
  enqueue({
    kind: 'invoice',
    label: verify ? '发票识别与校验' : '发票识别',
    run: async (ctx) => {
      const batch = s().batches.find((b) => b.id === batchId);
      if (!batch?.invoices) return;
      const list = batch.invoices;
      ctx.setProgress(0, list.length * (verify ? 2 : 1));
      let done = 0;
      const seen = new Map<string, string>();
      for (const item of list) {
        if (ctx.cancelled()) return;
        ctx.setStep(`第 ${verify ? 1 : 1} 步 · 识别 ${done + 1}/${list.length}`);
        const blob = await getBlob(item.blobKey);
        let patch: Partial<InvoiceItem> = {};
        if (!blob) {
          patch = { status: 'failed' };
        } else {
          try {
            const bytes = await blob.arrayBuffer();
            const doc = await openPdf(bytes);
            const text = await pageText(doc, 1);
            const parsed = parseInvoiceText(text);
            patch = {
              status: parsed.ok ? 'ok' : 'failed',
              number: parsed.number,
              date: parsed.date,
              amount: parsed.amount,
              seller: parsed.seller,
              buyer: parsed.buyer,
              category: parsed.category,
              pages: doc.numPages,
              routeFrom: parsed.routeFrom,
              routeTo: parsed.routeTo,
              trainNo: parsed.trainNo,
              departAt: parsed.departAt,
            };
            if (parsed.number) {
              if (seen.has(parsed.number)) patch.duplicate = true;
              else seen.set(parsed.number, item.id);
            }
          } catch {
            patch = { status: 'failed' };
          }
        }
        s().patchBatch(batchId, (b) => ({
          invoices: (b.invoices || []).map((it) => (it.id === item.id ? { ...it, ...patch } : it)),
        }));
        done++;
        ctx.setProgress(done, list.length * (verify ? 2 : 1));
      }

      if (verify) {
        for (const item of s().batches.find((b) => b.id === batchId)?.invoices || []) {
          if (ctx.cancelled()) return;
          ctx.setStep(`第 2 步 · 校验 ${done - list.length + 1}/${list.length}`);
          const blob = await getBlob(item.blobKey);
          let patch: Partial<InvoiceItem> = { verify: 'unavailable' };
          if (blob) {
            const res = await verifyInvoiceQr(await blob.arrayBuffer(), item.number, item.amount);
            patch = { verify: res.state, qrNumber: res.number, qrAmount: res.amount, verifyNote: res.note };
          }
          s().patchBatch(batchId, (b) => ({
            invoices: (b.invoices || []).map((it) => (it.id === item.id ? { ...it, ...patch } : it)),
          }));
          done++;
          ctx.setProgress(done, list.length * 2);
        }
      }
      const failedCount = (s().batches.find((b) => b.id === batchId)?.invoices || []).filter((i) => i.status !== 'ok').length;
      if (failedCount > 0) {
        ctx.setStep(`还有 ${failedCount} 张未识别`);
        ctx.setTone('warn');
      } else {
        ctx.setStep('信息表已生成');
      }
    },
  });
}

export async function importTrajectoryFiles(files: File[]): Promise<Batch> {
  const batch: Batch = {
    id: uid('traj'),
    kind: 'trajectory',
    createdAt: Date.now(),
    name: `${stamp()}_轨迹批次`,
    images: [],
  };
  const items: TrajItem[] = [];
  for (const f of files) {
    const key = `blob_${uid('img')}`;
    await putBlob(key, f);
    let w = 0;
    let h = 0;
    try {
      const bmp = await createImageBitmap(f);
      w = bmp.width;
      h = bmp.height;
      bmp.close();
    } catch {
      /* ignore */
    }
    items.push({ id: uid('t'), fileName: f.name, blobKey: key, w, h, status: 'pending' });
  }
  batch.images = items;
  s().addBatch(batch);
  s().setView('trajectory', batch.id);
  startOcr(batch.id);
  return batch;
}

export function startOcr(batchId: string) {
  enqueue({
    kind: 'trajectory',
    label: '轨迹时间识别',
    run: async (ctx) => {
      const batch = s().batches.find((b) => b.id === batchId);
      if (!batch?.images) return;
      const list = batch.images;
      const model = s().settings.ocrModelId;
      ctx.setProgress(0, list.length);
      let done = 0;
      for (const item of list) {
        if (ctx.cancelled()) return;
        ctx.setStep(`识别头部时间 ${done + 1}/${list.length}`);
        let patch: Partial<TrajItem> = { status: 'unknown' };
        if (item.status === 'ok' && item.manual) {
          done++;
          ctx.setProgress(done, list.length);
          continue;
        }
        const blob = await getBlob(item.blobKey);
        if (blob) {
          try {
            const res = await readHeaderTime(blob, model);
            if (res.date) patch = { status: 'ok', date: res.date, time: res.time };
            else patch = { status: 'unknown' };
          } catch {
            patch = { status: 'unknown' };
          }
        }
        s().patchBatch(batchId, (b) => ({
          images: (b.images || []).map((it) => (it.id === item.id ? { ...it, ...patch } : it)),
        }));
        done++;
        ctx.setProgress(done, list.length);
      }
      const unknown = (s().batches.find((b) => b.id === batchId)?.images || []).filter((i) => i.status !== 'ok').length;
      s().patchBatch(batchId, (b) => {
        const list = [...(b.images || [])];
        const known = list.filter((i) => i.status === 'ok' && i.date);
        const rest = list.filter((i) => !(i.status === 'ok' && i.date));
        known.sort((a, b2) => (a.date! + (a.time || '00:00')).localeCompare(b2.date! + (b2.time || '00:00')));
        return { images: [...known, ...rest] };
      });
      ctx.setStep(unknown ? `还有 ${unknown} 张未识别` : '全部识别完成');
      if (unknown) ctx.setTone('warn');
    },
  });
}

export function setTrajTime(batchId: string, itemId: string, value: string) {
  const [d, t] = value.split('T');
  s().patchBatch(batchId, (b) => ({
    images: (b.images || []).map((it) =>
      it.id === itemId ? { ...it, status: 'ok', date: d, time: t || '00:00', manual: true } : it,
    ),
  }));
}

export function skipTraj(batchId: string, itemId: string) {
  s().patchBatch(batchId, (b) => ({
    images: (b.images || []).map((it) => (it.id === itemId ? { ...it, status: 'skipped', date: undefined, time: undefined } : it)),
  }));
}

export function restoreTraj(batchId: string, itemId: string) {
  s().patchBatch(batchId, (b) => ({
    images: (b.images || []).map((it) => (it.id === itemId ? { ...it, status: 'unknown' } : it)),
  }));
}

export function skipAllUnknown(batchId: string) {
  s().patchBatch(batchId, (b) => ({
    images: (b.images || []).map((it) => (it.status === 'unknown' ? { ...it, status: 'skipped' } : it)),
  }));
}

export function setInvoiceCategory(batchId: string, itemId: string, category: InvoiceItem['category']) {
  s().patchBatch(batchId, (b) => ({
    invoices: (b.invoices || []).map((it) => (it.id === itemId ? { ...it, category, manualCategory: true } : it)),
  }));
}

export async function exportInvoicePdf(batchId: string) {
  const batch = s().batches.find((b) => b.id === batchId);
  if (!batch) return;
  if (!batch.layoutDone) {
    s().showToast('拼版还在生成，请稍候');
    return;
  }
  if (!batch.done) {
    s().showToast('先点「完成」，再导出');
    return;
  }
  const blob = await getBlob(batch.layoutKey || '');
  if (!blob) return;
  const { downloadBlob } = await import('./db');
  downloadBlob(blob, `${stamp()}_发票拼版.pdf`);
}

export async function finishInvoiceBatch(batchId: string) {
  const batch = s().batches.find((b) => b.id === batchId);
  if (!batch) return;
  if (batch.done) return;
  if (!batch.layoutDone || !batch.layoutKey) {
    s().showToast('拼版还没完成，请稍等');
    return;
  }
  if (!batch.layoutFileId) {
    const blob = await getBlob(batch.layoutKey);
    if (blob) {
      const id = uid('lib');
      s().addFile({
        id,
        name: `${stamp()}_发票拼版`,
        blobKey: batch.layoutKey,
        ext: 'pdf',
        createdAt: Date.now(),
        pages: batch.layoutPages,
        bytes: blob.size,
        batchId,
      });
      s().patchBatch(batchId, { layoutFileId: id });
    }
  }
  if (batch.mode && batch.mode !== 'layout' && batch.invoices?.length) {
    const blob = await buildInvoiceInfoPdf(batch.invoices, batch.name);
    const key = `blob_${uid('info')}`;
    await putBlob(key, blob);
    s().addFile({
      id: uid('lib'),
      name: `${stamp()}_发票信息表`,
      blobKey: key,
      ext: 'pdf',
      createdAt: Date.now(),
      bytes: blob.size,
      batchId,
    });
  }
  s().patchBatch(batchId, { done: true, doneAt: Date.now() });
  s().showToast('已完成，文件已存入材料库');
}

export function finishTrajectoryBatch(batchId: string) {
  s().patchBatch(batchId, { done: true, doneAt: Date.now() });
  s().showToast('已完成，可以导出了');
}

export async function exportInvoiceInfo(batchId: string, format: 'pdf' | 'csv' | 'copy') {
  const batch = s().batches.find((b) => b.id === batchId);
  if (!batch?.invoices) return;
  if (format === 'csv') {
    const { downloadBlob } = await import('./db');
    downloadBlob(new Blob([invoiceCsv(batch.invoices)], { type: 'text/csv;charset=utf-8' }), `${stamp()}_发票信息表.csv`);
    return;
  }
  if (format === 'copy') {
    const { invoicePlainText } = await import('./exports');
    await navigator.clipboard.writeText(invoicePlainText(batch.invoices));
    s().showToast('已复制，可直接粘贴到表格');
    return;
  }
  const blob = await buildInvoiceInfoPdf(batch.invoices, batch.name);
  const { downloadBlob } = await import('./db');
  downloadBlob(blob, `${stamp()}_发票信息表.pdf`);
}

export async function exportTrajectory(batchId: string, format: 'pdf' | 'docx') {
  const batch = s().batches.find((b) => b.id === batchId);
  if (!batch?.images?.length) return;
  if (!batch.done) {
    s().showToast('先点「完成」，再导出');
    return;
  }
  const unknown = batch.images.filter((i) => i.status === 'unknown');
  s().showToast(unknown.length ? `还有 ${unknown.length} 张未识别，已排到最后` : '正在导出');
  const { downloadBlob } = await import('./db');
  if (format === 'pdf') {
    const res = await buildTrajectoryPdf(batch.images);
    const key = `blob_${uid('trajpdf')}`;
    await putBlob(key, res.blob);
    s().addFile({ id: uid('lib'), name: `${stamp()}_轨迹图`, blobKey: key, ext: 'pdf', createdAt: Date.now(), pages: res.pages, bytes: res.blob.size, batchId });
    downloadBlob(res.blob, `${stamp()}_轨迹图.pdf`);
  } else {
    const blob = await buildTrajectoryDocx(batch.images);
    const key = `blob_${uid('trajdoc')}`;
    await putBlob(key, blob);
    s().addFile({ id: uid('lib'), name: `${stamp()}_轨迹图`, blobKey: key, ext: 'docx', createdAt: Date.now(), bytes: blob.size, batchId });
    downloadBlob(blob, `${stamp()}_轨迹图.docx`);
  }
  skipAllUnknown(batchId);
}
