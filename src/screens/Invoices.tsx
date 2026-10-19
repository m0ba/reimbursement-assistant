import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../lib/store';
import type { InvoiceMode } from '../lib/types';
import { appendInvoiceFiles, applyInvoiceMode, changePerPage, exportInvoiceInfo, exportInvoicePdf, finishInvoiceBatch, importInvoiceFiles, setInvoiceCategory, startParse } from '../lib/flows';
import { Sheet } from '../components/Sheet';
import { Ring } from '../components/TaskBadge';
import { PdfThumb } from '../components/PdfThumb';
import { IconCheck, IconCopy, IconDownload, IconInvoice, IconPlus } from '../components/Icons';
import { PdfPages } from '../components/PdfPages';
import { EmptyState } from '../components/EmptyState';

const MODES: { id: InvoiceMode; title: string; desc: string; cost: string }[] = [
  { id: 'layout', title: '只要拼版', desc: '只出一份能直接打印的 A4 发票页，最快', cost: '约 1 秒' },
  { id: 'info', title: '拼版 + 信息表', desc: '多识别出类型、号码、日期、销售方和金额，方便录入或核对', cost: '约 +3 秒' },
  { id: 'verify', title: '拼版 + 信息表 + 二维码校验', desc: '再核对号码和金额与票面二维码是否一致，能发现被改过的票', cost: '约 +10 秒' },
];

export default function Invoices() {
  const batches = useStore((s) => s.batches);
  const activeId = useStore((s) => s.activeBatchId);
  const setView = useStore((s) => s.setView);
  const lastMode = useStore((s) => s.settings.lastInvoiceMode);
  const settingsPerPage = useStore((s) => s.settings.perPage);
  const task = useStore((s) => s.task);
  const files = useStore((s) => s.files);
  const pickRef = useRef<HTMLInputElement>(null);
  const [modeOpen, setModeOpen] = useState(false);
  const [mode, setMode] = useState<InvoiceMode>(lastMode);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [appendId, setAppendId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; num: string; amt: string } | null>(null);

  const batch = useMemo(() => {
    return batches.find((b) => b.id === activeId && b.kind === 'invoice');
  }, [batches, activeId]);

  useEffect(() => {
    if (batch) return;
    const t = useStore.getState().task;
    if (!t.running && (t.kind || t.tone !== 'idle' || t.step)) {
      useStore.getState().setTask({
        kind: null, label: '', step: '', done: 0, total: 0,
        running: false, paused: false, cancelRequested: false, tone: 'idle',
      });
    }
  }, [batch]);

  const onPick = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files).filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!arr.length) {
      useStore.getState().showToast('请选择 PDF 发票文件');
      return;
    }
    setMode(lastMode);
    await importInvoiceFiles(arr);
    const latest = useStore.getState().batches[0];
    setPendingId(latest.id);
    setModeOpen(true);
  };

  const mergeRunning = task.kind === 'merge' && task.running;
  const mergeDone = batch?.layoutDone;
  const mergePct = mergeRunning && task.total ? task.done / task.total : mergeDone ? 1 : 0.06;

  const confirmMode = () => {
    if (!pendingId) return;
    applyInvoiceMode(pendingId, mode);
    setModeOpen(false);
    setPendingId(null);
  };

  const closeModeAsLayout = () => {
    if (pendingId) {
      const b = useStore.getState().batches.find((x) => x.id === pendingId);
      if (b && !b.mode) applyInvoiceMode(pendingId, 'layout');
    }
    setModeOpen(false);
    setPendingId(null);
  };

  const invoices = batch?.invoices || [];
  const parsedCount = invoices.filter((i) => i.status === 'ok').length;
  const failed = invoices.filter((i) => i.status === 'failed').length;
  const total = invoices.reduce((s, i) => s + (i.amount || 0), 0);
  const parsing = task.kind === 'invoice' && task.running;
  const verifyOn = batch?.mode === 'verify';
  const per = batch?.perPage ?? settingsPerPage;
  const setPer = (n: 2 | 4) => {
    if (batch) changePerPage(batch.id, n);
    else useStore.getState().setSettings({ perPage: n });
  };

  return (
    <div className="page">
      <div className="large-title">发票整理</div>
      <div className="subtitle">
        把要报销的发票 PDF 拼成能直接打印的 A4 页，印完沿虚线裁开，就是一张张整齐的票据。需要的话再顺手生成发票信息表、核对号码和金额。文件名乱码也不影响识别。
      </div>

      <div className="seg" style={{ marginBottom: 8 }}>
        <button className={per === 2 ? 'on' : ''} onClick={() => setPer(2)}>每页 2 张</button>
        <button className={per === 4 ? 'on' : ''} onClick={() => setPer(4)}>每页 4 张</button>
      </div>
      <div className="tiny" style={{ margin: '0 4px 16px' }}>
        每页 2 张：单张更大更清楚；每页 4 张：两行两列，每张旋转 90°、长边朝内，横竖各一条裁切线，裁开后是四张一样大的 A6，适合张数多、想省纸的时候。
      </div>

      <input
        ref={pickRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          const list = e.target.files;
          const target = appendId;
          setAppendId(null);
          if (target && list?.length) {
            const arr = Array.from(list).filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
            if (arr.length) void appendInvoiceFiles(target, arr);
          } else {
            void onPick(list);
          }
          e.target.value = '';
        }}
      />

      {!batch && (
        <div className="card">
          <EmptyState
            icon={<IconInvoice size={22} />}
            title="还没有导入发票"
            hint="点下面的按钮，从「文件」里多选几张 PDF"
          />
          <button className="btn primary wide" onClick={() => pickRef.current?.click()}>
            <IconPlus size={18} /> 导入发票 PDF
          </button>
        </div>
      )}

      {batch && (
        <>
          <div className="card">
            <div className="row between">
              <div>
                <div style={{ fontWeight: 600 }}>A4 拼版</div>
                <div className="tiny" style={{ marginTop: 2 }}>
                  {invoices.length} 张发票 · {batch.layoutPages || '—'} 页 · 每页 {per} 张
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {batch.done ? <span className="chip ok">已完成</span> : <span className="chip warn">草稿</span>}
                <Ring value={mergePct} size={22} tone={mergeDone ? 'done' : 'run'} />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              {batch.layoutKey ? (
                <PdfPages blobKey={batch.layoutKey} />
              ) : (
                <div className="shimmer" style={{ height: 180, borderRadius: 10 }} />
              )}
            </div>
            <div className="tiny" style={{ margin: '2px 0 10px' }}>
              {batch.layoutPages ? `共 ${batch.layoutPages} 页，左右滑动查看` : '正在生成预览…'}
            </div>

            <div className="row" style={{ gap: 10 }}>
              {!batch.done ? (
                <>
                  <button className="btn primary grow" onClick={() => finishInvoiceBatch(batch.id)} disabled={!mergeDone}>
                    <IconCheck size={18} /> 完成
                  </button>
                  <button className="btn" onClick={() => { setAppendId(batch.id); pickRef.current?.click(); }}>继续导入</button>
                </>
              ) : (
                <button className="btn primary wide" onClick={() => exportInvoicePdf(batch.id)}>
                  <IconDownload size={18} /> 导出 PDF
                </button>
              )}
            </div>
            {!batch.done && (
              <div className="tiny" style={{ marginTop: 8 }}>点「完成」后才会存入材料库并允许导出；完成后不能再修改。</div>
            )}
          </div>

          {batch.mode === 'layout' && !batch.done && (
            <div className="card">
              <div className="row between">
                <div>
                  <div style={{ fontWeight: 600 }}>还没有信息表</div>
                  <div className="tiny">可以随时补生成，不需要重新导入</div>
                </div>
                <button className="btn ghost" onClick={() => applyInvoiceMode(batch.id, 'info')}>生成</button>
              </div>
            </div>
          )}

          {batch.mode && batch.mode !== 'layout' && (
            <div className="card">
              <div className="row between" style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>发票信息表</div>
                <span className="tiny">{parsing ? `识别中 ${task.done}/${task.total || invoices.length}` : `${parsedCount}/${invoices.length} 已识别`}</span>
              </div>

              {parsing && parsedCount === 0 && (
                <div style={{ display: 'grid', gap: 8, padding: '6px 0' }}>
                  {[0, 1, 2, 3].map((k) => (
                    <div key={k} className="shimmer" style={{ width: `${92 - k * 6}%` }} />
                  ))}
                </div>
              )}

              {(parsedCount > 0 || failed > 0) && (
                <>
                  {invoices.length > 5 && (
                    <div className="tiny" style={{ marginBottom: 4 }}>共 {invoices.length} 张，表格可上下滑动</div>
                  )}
                  <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>类型</th>
                        <th>发票号码</th>
                        <th>开票时间</th>
                        <th className="num" style={{ paddingRight: 8 }}>金额</th>
                        {verifyOn && <th style={{ paddingLeft: 8 }}>校验</th>}
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence initial={false}>
                        {invoices.map((it) => (
                          <motion.tr
                            key={it.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                          >
                            <td>
                              <select
                                value={it.category || '其他'}
                                onChange={(e) => setInvoiceCategory(batch.id, it.id, e.target.value as any)}
                                disabled={!!batch.done}
                                style={{ border: 0, background: 'rgba(120,120,128,.1)', borderRadius: 8, padding: '4px 6px', fontSize: 12 }}
                              >
                                <option>住宿</option>
                                <option>火车</option>
                                <option>打车</option>
                                <option>其他</option>
                              </select>
                              {it.routeFrom && it.routeTo && (
                                <div className="tiny" style={{ marginTop: 3, fontSize: 10.5, lineHeight: 1.5 }}>
                                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {it.routeFrom}→{it.routeTo}
                                  </div>
                                  {it.departAt && <div className="mono" style={{ color: 'var(--text2)' }}>{`${it.departAt.slice(0, 10)} ${it.departAt.slice(11)}`}</div>}
                                </div>
                              )}
                            </td>
                            <td className="mono" style={{ fontSize: verifyOn ? 10 : 11 }}>
                              <div className="row" style={{ gap: 6 }}>
                                <span style={{ wordBreak: 'break-all' }}>
                                  {it.number || (
                                    <button className="chip warn" onClick={() => setEdit({ id: it.id, num: '', amt: '' })}>
                                      未识别
                                    </button>
                                  )}
                                </span>
                                {it.number && (
                                  <button
                                    className="copy-mini"
                                    aria-label="复制发票号码"
                                    onClick={async () => {
                                      await navigator.clipboard.writeText(it.number!);
                                      useStore.getState().showToast('已复制发票号码');
                                    }}
                                  >
                                    <IconCopy size={12} />
                                  </button>
                                )}
                              </div>
                              {it.duplicate && <span className="chip bad" style={{ marginTop: 4 }}>重复</span>}
                            </td>
                            <td className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap', color: 'var(--text2)' }}>
                              {it.date || '—'}
                            </td>
                            <td className="num mono" style={{ paddingRight: 8 }}>
                              {it.amount !== undefined ? (
                                it.amount.toFixed(2)
                              ) : (
                                <button className="chip" onClick={() => setEdit({ id: it.id, num: it.number || '', amt: '' })}>补录</button>
                              )}
                            </td>
                            {verifyOn && (
                              <td style={{ paddingLeft: 8 }}>
                                {it.verify === 'ok' && <span className="chip ok">一致</span>}
                                {it.verify === 'mismatch' && (
                                  <motion.span className="chip warn" animate={{ x: [0, -3, 3, -2, 0] }} transition={{ duration: 0.3 }}>
                                    不一致
                                  </motion.span>
                                )}
                                {(it.verify === 'unavailable' || it.verify === 'unknown' || !it.verify) && <span className="chip gray">—</span>}
                              </td>
                            )}
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                  </div>
                  <div className="divider" />
                  <div className="row between">
                    <span className="tiny">合计</span>
                    <b className="mono">¥{total.toFixed(2)}</b>
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 12 }}>
                    <button className="btn grow" onClick={() => exportInvoiceInfo(batch.id, 'copy')}>复制</button>
                    <button className="btn grow" onClick={() => exportInvoiceInfo(batch.id, 'csv')}>CSV</button>
                    <button className="btn primary grow" onClick={() => exportInvoiceInfo(batch.id, 'pdf')}>信息表 PDF</button>
                  </div>
                </>
              )}
            </div>
          )}

        </>
      )}

      <Sheet
        open={modeOpen}
        onClose={closeModeAsLayout}
        title="要生成哪些信息？"
        lead={`已导入 ${invoices.length} 个文件 · 共 ${batch?.layoutPages || invoices.length} 页`}
      >
        {MODES.map((m) => (
          <motion.button
            key={m.id}
            className={'option' + (mode === m.id ? ' selected' : '')}
            onClick={() => setMode(m.id)}
            whileTap={{ scale: 0.99 }}
          >
            <span className="radio" />
            <span className="grow">
              <div className="t">{m.title}</div>
              <div className="d">{m.desc}</div>
              <div className="e">{m.cost}</div>
            </span>
          </motion.button>
        ))}

        <div className="statusline">
          <Ring value={mergePct} tone={mergeDone ? 'done' : 'run'} />
          <span>
            {mergeDone
              ? '拼版已就绪，选完即可导出'
              : mergeRunning
                ? `正在拼版 ${task.done}/${task.total || invoices.length}`
                : '准备拼版…'}
          </span>
        </div>

        <button className="btn primary wide" onClick={confirmMode}>
          开始
        </button>
      </Sheet>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title="补录发票信息" lead="识别不到时手动填写，保存后计入信息表">
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <input
            placeholder="发票号码（可留空）"
            value={edit?.num || ''}
            onChange={(e) => setEdit((v) => (v ? { ...v, num: e.target.value } : v))}
            style={{ border: 0, background: 'rgba(120,120,128,.1)', borderRadius: 10, padding: 12, fontSize: 15 }}
          />
          <input
            placeholder="金额，例如 214.00"
            inputMode="decimal"
            value={edit?.amt || ''}
            onChange={(e) => setEdit((v) => (v ? { ...v, amt: e.target.value } : v))}
            style={{ border: 0, background: 'rgba(120,120,128,.1)', borderRadius: 10, padding: 12, fontSize: 15 }}
          />
        </div>
        <button
          className="btn primary wide"
          onClick={() => {
            if (batch && edit) {
              const amt = Number(edit.amt);
              useStore.getState().patchBatch(batch.id, (b) => ({
                invoices: (b.invoices || []).map((it) =>
                  it.id === edit.id
                    ? {
                        ...it,
                        number: edit.num.trim() || it.number,
                        amount: Number.isFinite(amt) && edit.amt.trim() ? amt : it.amount,
                        status: (edit.num.trim() || edit.amt.trim()) ? 'ok' : it.status,
                      }
                    : it,
                ),
              }));
            }
            setEdit(null);
          }}
        >
          保存
        </button>
      </Sheet>
    </div>
  );
}
