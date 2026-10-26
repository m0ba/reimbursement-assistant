import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { useStore } from '../lib/store';
import { Confirm, Sheet } from '../components/Sheet';
import { IconCheck, IconClose, IconCopy, IconDownload, IconPlus, IconTrash, IconBox } from '../components/Icons';
import { putBlob, uid, downloadBlob } from '../lib/db';
import { useBlobUrl } from '../components/PdfThumb';
import type { PurchaseCategory, PurchaseItem, PurchasePriority } from '../lib/types';
import {
  createPurchaseList, ensureCategories, groupByCategory, itemTotal, listTotal,
  normalizeLink, sanitizeText, sanitizeUnit, validateItem, validateList, categoryResolved,
  PRIORITY_COLOR, PRIORITY_LABEL, PURCHASE_CATEGORIES, PURCHASE_UNITS, type ItemError,
} from '../lib/purchase';
import { buildPurchaseXlsx } from '../lib/purchaseExcel';

const money = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ItemImg({ blobKey, className = 'p-thumb' }: { blobKey: string; className?: string }) {
  const url = useBlobUrl(blobKey);
  return url ? <img src={url} alt="" className={className} /> : <div className={className + ' shimmer'} />;
}

async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.85));
  return blob || file;
}

export default function Purchase() {
  const purchase = useStore((s) => s.purchase);
  const layoutPref = useStore((s) => s.settings.purchaseLayout);
  const setSettings = useStore((s) => s.setSettings);
  const setPurchase = useStore((s) => s.setPurchase);
  const patchPurchase = useStore((s) => s.patchPurchase);
  const setView = useStore((s) => s.setView);

  const [activeCat, setActiveCat] = useState('');
  const [editing, setEditing] = useState<{ item: PurchaseItem; isNew?: boolean } | null>(null);
  const [errors, setErrors] = useState<ItemError[]>([]);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [confirmKind, setConfirmKind] = useState<null | 'finish' | 'rollback' | 'delete' | 'clear' | 'export' | 'new' | 'catDone' | 'catNone' | 'catUndo'>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState(false);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [layoutAsk, setLayoutAsk] = useState(false);
  const wasNarrow = useRef(false);
  const [vpWidth, setVpWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [attachFor, setAttachFor] = useState<string | null>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const [newCat, setNewCat] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!purchase) return;
    if (!purchase.categories?.length) setPurchase(ensureCategories(purchase));
  }, [purchase?.id]);

  useEffect(() => {
    if (!purchase) return;
    if (!activeCat || !purchase.categories.some((c) => c.name === activeCat)) setActiveCat(purchase.categories[0]?.name || '');
  }, [purchase?.categories?.length, activeCat]);

  useEffect(() => {
    const onResize = () => setVpWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const narrow = vpWidth < 860;
    const fine = window.matchMedia('(pointer: fine)').matches;
    if (narrow && !wasNarrow.current && fine && layoutPref !== 'mobile') setLayoutAsk(true);
    wasNarrow.current = narrow;
  }, [vpWidth, layoutPref]);

  useEffect(() => {
    if (purchase) return;
    if (Capacitor.isNativePlatform() && !sessionStorage.getItem('purchase-mobile-hint')) {
      sessionStorage.setItem('purchase-mobile-hint', '1');
      setHintOpen(true);
    }
  }, [purchase]);

  const cats = purchase?.categories || [];
  const items = purchase?.items || [];
  const catItems = items.filter((i) => i.category === activeCat);
  const activeCategory = cats.find((c) => c.name === activeCat);
  const total = purchase ? listTotal(purchase) : 0;
  const isDesktopLayout = layoutPref === 'desktop' || (layoutPref !== 'mobile' && vpWidth >= 860);
  const resolved = cats.filter(categoryResolved).length;
  const allResolved = cats.length > 0 && resolved === cats.length;
  const groups = useMemo(() => (purchase ? groupByCategory(purchase) : []), [purchase]);

  const start = () => {
    const list = createPurchaseList();
    setPurchase(list);
    setActiveCat(list.categories[0].name);
  };

  const goCat = (dir: -1 | 1) => {
    const idx = cats.findIndex((c) => c.name === activeCat);
    const next = cats[idx + dir];
    if (next) setActiveCat(next.name);
  };

  const patchItems = (fn: (list: PurchaseItem[]) => PurchaseItem[]) => {
    if (!purchase) return;
    patchPurchase({ items: fn(purchase.items) });
  };

  const setField = (id: string, patch: Partial<PurchaseItem>) => {
    patchItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const addRow = () => {
    if (!purchase) return;
    const it: PurchaseItem = {
      id: uid('pi'),
      category: activeCat,
      name: '', spec: '', unit: '个', qty: 1, price: null,
      priority: 'mid', link: '', note: '', images: [],
    };
    patchItems((list) => [...list, it]);
    setFocusId(it.id);
    window.setTimeout(() => setFocusId(null), 50);
  };

  const openDetail = (id: string) => {
    if (purchase?.done) return;
    const it = items.find((i) => i.id === id);
    if (it) {
      setEditing({ item: { ...it, images: [...it.images] } });
      setErrors([]);
    }
  };

  const saveEditing = () => {
    if (!editing) return;
    const errs = validateItem(editing.item, Math.max(0, items.findIndex((i) => i.id === editing.item.id)));
    if (errs.length) {
      setErrors(errs);
      useStore.getState().showToast(errs[0].message);
      const sheet = document.querySelector('.sheet') as HTMLElement | null;
      sheet?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    patchItems((list) => list.map((it) => (it.id === editing.item.id ? editing.item : it)));
    setEditing(null);
    setErrors([]);
  };

  const cancelEditing = () => {
    if (!editing) return;
    if (editing.isNew) {
      const it = editing.item;
      const blank = !it.name.trim() && !it.spec.trim() && !it.note.trim() && !it.link.trim() && it.images.length === 0;
      if (blank) patchItems((list) => list.filter((x) => x.id !== it.id));
    }
    setEditing(null);
  };

  const duplicate = (id: string) => {
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const copy: PurchaseItem = { ...items[idx], id: uid('pi'), images: [...items[idx].images] };
    patchItems((list) => {
      const next = [...list];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    useStore.getState().showToast('已复制这一项');
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    patchItems((list) => {
      const next = [...list];
      const target = next.findIndex((i) => i.id === id);
      const to = target + dir;
      if (to < 0 || to >= next.length) return list;
      [next[target], next[to]] = [next[to], next[target]];
      return next;
    });
  };

  const deleteItem = (id: string) => {
    const item = items.find((i) => i.id === id);
    patchItems((list) => list.filter((i) => i.id !== id));
    setConfirmKind(null);
    setPendingDelete(null);
    useStore.getState().showToast(`已删除「${item?.name || '未命名'}」`);
  };

  const setCategoryStatus = (name: string, status: PurchaseCategory['status']) => {
    if (!purchase) return;
    patchPurchase({ categories: purchase.categories.map((c) => (c.name === name ? { ...c, status } : c)) });
  };

  const addCategory = () => {
    if (!purchase) return;
    const name = sanitizeText(newCat, { max: 10 });
    if (!name) return;
    if (purchase.categories.some((c) => c.name === name)) {
      useStore.getState().showToast('这个分类已经存在');
      return;
    }
    patchPurchase({ categories: [...purchase.categories, { name, status: 'open' }] });
    setActiveCat(name);
    setNewCat('');
    setAddCatOpen(false);
  };

  const finish = () => {
    if (!purchase) return;
    if (!allResolved) {
      useStore.getState().showToast('还有分类没有填写完成');
      setConfirmKind(null);
      return;
    }
    const errs = validateList(purchase);
    if (errs.length) {
      setErrors(errs);
      useStore.getState().showToast(errs[0].message);
      setConfirmKind(null);
      return;
    }
    patchPurchase({ done: true, doneAt: Date.now() });
    setConfirmKind(null);
    useStore.getState().showToast('已完成，可以导出 Excel');
  };

  const rollback = () => {
    patchPurchase({ done: false });
    setConfirmKind(null);
    useStore.getState().showToast('已打回，可以继续修改');
  };

  const exportExcel = async () => {
    if (!purchase || !purchase.done) return;
    setBusy(true);
    try {
      const blob = await buildPurchaseXlsx(purchase);
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `采购清单_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;
      const key = `blob_${uid('plxlsx')}`;
      await putBlob(key, blob);
      useStore.getState().addFile({ id: uid('lib'), name: name.replace(/\.xlsx$/, ''), blobKey: key, ext: 'xlsx', createdAt: Date.now(), bytes: blob.size });
      await downloadBlob(blob, name);
      setConfirmKind(null);
      setExported(true);
    } catch {
      useStore.getState().showToast('导出失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const newList = () => {
    setPurchase(null);
    setEditing(null);
    setExported(false);
    setConfirmKind(null);
    setActiveCat('');
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length || !editing) return;
    const list = [...editing.item.images];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      if (list.length >= 6) {
        useStore.getState().showToast('每项最多 6 张图片');
        break;
      }
      const blob = await compressImage(f);
      const key = `pimg_${uid('i')}`;
      await putBlob(key, blob);
      list.push({ id: uid('pim'), blobKey: key, name: f.name });
    }
    setEditing({ ...editing, item: { ...editing.item, images: list } });
  };

  const pickAttach = (id: string) => {
    setAttachFor(id);
    attachRef.current?.click();
  };

  const onAttachFiles = async (files: FileList | null) => {
    const id = attachFor;
    setAttachFor(null);
    if (!files?.length || !id || !purchase) return;
    const item = purchase.items.find((i) => i.id === id);
    if (!item) return;
    const list = [...item.images];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      if (list.length >= 6) {
        useStore.getState().showToast('每项最多 6 张图片');
        break;
      }
      const blob = await compressImage(f);
      const key = `pimg_${uid('i')}`;
      await putBlob(key, blob);
      list.push({ id: uid('pim'), blobKey: key, name: f.name });
    }
    setField(id, { images: list });
  };

  // ---------- 空状态 ----------
  if (!purchase) {
    return (
      <div className="page purchase-page">
        <div className="card">
          <div className="p-empty">
            <span className="p-empty-ico"><IconBox size={22} /></span>
            <div style={{ fontWeight: 600, marginTop: 10 }}>还没有采购清单</div>
            <div className="tiny" style={{ marginTop: 4 }}>按分类逐项填写，一行一个物品，完成后导出 Excel</div>
          </div>
          <button className="btn primary wide" style={{ marginTop: 14 }} onClick={start}>
            <IconPlus size={18} /> 开始填写
          </button>
        </div>
        <Sheet open={hintOpen} onClose={() => setHintOpen(false)} title="建议在电脑上填写" lead="采购清单字段较多，电脑上排版更宽松、录入更快。手机上也可以继续用。">
          <div className="row" style={{ gap: 10 }}>
            <button className="btn grow" onClick={() => setHintOpen(false)}>继续用手机</button>
            <button className="btn primary grow" onClick={() => { setHintOpen(false); setView('settings'); }}>去下载电脑版</button>
          </div>
        </Sheet>
      </div>
    );
  }

  const done = purchase.done;

  return (
    <div className={"page purchase-page " + (isDesktopLayout ? "p-desktop" : "p-mobile")}>
      <div className="card">
        <div className="row between">
          <input
            className="p-name"
            value={purchase.name}
            disabled={done}
            onChange={(e) => patchPurchase({ name: sanitizeText(e.target.value, { max: 40 }) })}
            aria-label="清单名称"
          />
          <span className={'chip ' + (done ? 'ok' : 'warn')}>{done ? '已完成' : '草稿'}</span>
        </div>
        <div className="p-sum">
          <span>{items.length} 项 · 已填 {resolved}/{cats.length}</span>
          <b>¥{money(total)}</b>
        </div>
        <div className="p-progress"><i style={{ width: `${cats.length ? (resolved / cats.length) * 100 : 0}%` }} /></div>
        {done && <div className="tiny" style={{ marginTop: 8 }}>已完成，如需修改请点「打回修改」</div>}
        {!done && allResolved && (
          <button className="btn primary wide" style={{ marginTop: 12 }} onClick={() => setConfirmKind('finish')}>
            <IconCheck size={18} /> 完成清单
          </button>
        )}
      </div>

      <div className="p-layout">
        <aside className="p-side">
          <div className="tiny" style={{ marginBottom: 8 }}>分类</div>
          {cats.map((c) => {
            const n = items.filter((i) => i.category === c.name).length;
            return (
              <button key={c.name} className={'p-cat' + (c.name === activeCat ? ' on' : '')} onClick={() => setActiveCat(c.name)}>
                <span>{c.name}</span>
                <span className="p-cat-n">{c.status === 'none' ? '无' : n}</span>
              </button>
            );
          })}
          {!done && <button className="p-cat p-cat-add" onClick={() => setAddCatOpen(true)}>＋ 分类</button>}
          <div className="tiny" style={{ marginTop: 12 }}>{resolved}/{cats.length}</div>
          <div className="progress-track" style={{ marginTop: 6 }}><i style={{ width: `${cats.length ? (resolved / cats.length) * 100 : 0}%` }} /></div>
        </aside>

        <main className="p-main">
          <div className="p-tabs">
            {cats.map((c) => (
              <button key={c.name} className={'tabx' + (c.name === activeCat ? ' on' : '')} onClick={() => setActiveCat(c.name)}>
                {c.name}<span>{c.status === 'none' ? '无' : items.filter((i) => i.category === c.name).length}</span>
              </button>
            ))}
            {!done && <button className="tabx" onClick={() => setAddCatOpen(true)}>＋</button>}
          </div>

          <div className="p-cat-head">
            <div>
              <div className="p-cat-title">{activeCat}</div>
              <div className="tiny">{catItems.length} 项 · 小计 ¥{money(catItems.reduce((s, i) => s + (itemTotal(i) ?? 0), 0))}</div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {activeCategory?.status === 'done' && <span className="chip ok">本类已完成</span>}
              {activeCategory?.status === 'none' && <span className="chip">本类无采购</span>}
              {!done && activeCategory?.status === 'open' && (
                <button className="dl-btn tint" onClick={() => setConfirmKind(catItems.length ? 'catDone' : 'catNone')}>
                  {catItems.length ? '完成本分类' : '本类无采购'}
                </button>
              )}
              {!done && activeCategory?.status !== 'open' && (
                <button className="dl-btn" onClick={() => setCategoryStatus(activeCat, 'open')}>打回本类</button>
              )}
            </div>
          </div>

          <div className="p-table-wrap">
            <table className="p-table">
              <thead>
                <tr>
                  <th className="sticky">名称 / 规格</th>
                  <th className="w-unit">单位</th>
                  <th className="w-num">数量</th>
                  <th className="w-price">单价</th>
                  <th className="w-total">小计</th>
                  <th className="w-prio">优先级</th>
                  <th className="w-link">购买链接</th>
                  <th className="w-att">附件</th>
                  <th className="w-note">备注</th>
                  <th className="w-more"></th>
                </tr>
              </thead>
              <tbody>
                {catItems.map((it) => (
                  <tr key={it.id}>
                    <td className="sticky">
                      <div className="p-rowname">
                        <span className="p-prio" style={{ background: PRIORITY_COLOR[it.priority] }} />
                        <div className="grow">
                          {done ? (
                            <div className="p-rname">{it.name || '未命名'}</div>
                          ) : (
                            <input
                              className="p-inline p-inline-name"
                              autoFocus={focusId === it.id}
                              value={it.name}
                              placeholder="填写名称"
                              onChange={(e) => setField(it.id, { name: sanitizeText(e.target.value, { max: 60 }) })}
                            />
                          )}
                          {!done && isDesktopLayout ? (
                            <input
                              className="p-inline p-inline-spec"
                              value={it.spec}
                              placeholder="规格 / 配置"
                              onChange={(e) => setField(it.id, { spec: sanitizeText(e.target.value, { multiline: false, max: 300 }) })}
                            />
                          ) : (
                            <button className="p-spec" onClick={() => openDetail(it.id)}>
                              {it.spec || '＋ 规格 / 链接 / 备注 / 图片'}
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="w-unit">
                      {done ? it.unit : (
                        <input className="p-inline" value={it.unit} onChange={(e) => setField(it.id, { unit: sanitizeUnit(e.target.value) })} />
                      )}
                    </td>
                    <td className="w-num">
                      {done ? (it.qty ?? '—') : (
                        <input className="p-inline p-num" type="number" inputMode="decimal" min={0} step="0.01" value={it.qty ?? ''} onChange={(e) => setField(it.id, { qty: e.target.value === '' ? null : Number(e.target.value) })} />
                      )}
                    </td>
                    <td className="w-price">
                      {done ? (it.price === null ? '—' : money(it.price)) : (
                        <input className="p-inline p-num" type="number" inputMode="decimal" min={0} step="0.01" value={it.price ?? ''} onChange={(e) => setField(it.id, { price: e.target.value === '' ? null : Number(e.target.value) })} />
                      )}
                    </td>
                    <td className="w-total money">{itemTotal(it) === null ? '—' : money(itemTotal(it)!)}</td>
                    <td className="w-prio">
                      {done || !isDesktopLayout ? (
                        <span className="p-prio-tag" style={{ color: PRIORITY_COLOR[it.priority] }}>{PRIORITY_LABEL[it.priority]}</span>
                      ) : (
                        <select
                          className="p-inline p-prio-select"
                          value={it.priority}
                          onChange={(e) => setField(it.id, { priority: e.target.value as PurchasePriority })}
                        >
                          <option value="high">高</option>
                          <option value="mid">中</option>
                          <option value="low">低</option>
                        </select>
                      )}
                    </td>

                    <td className="w-link">
                      {done || !isDesktopLayout ? (
                        it.link ? <button className="p-cell-link" onClick={() => window.open(it.link, '_blank', 'noopener')}>打开</button> : <span className="p-cell-text">—</span>
                      ) : (
                        <input
                          className="p-inline p-inline-link"
                          value={it.link}
                          placeholder="https://…"
                          onChange={(e) => setField(it.id, { link: e.target.value })}
                          onBlur={(e) => setField(it.id, { link: normalizeLink(e.target.value) })}
                        />
                      )}
                    </td>
                    <td className="w-att">
                      {!done ? (
                        <button className={'p-att' + (it.images.length ? '' : ' empty')} onClick={() => pickAttach(it.id)}>
                          {it.images.length ? `${it.images.length} 图` : '＋'}
                        </button>
                      ) : it.images.length ? `${it.images.length} 图` : '—'}
                    </td>
                    <td className="w-note">
                      {done || !isDesktopLayout ? (
                        <span className="p-cell-text">{it.note || '—'}</span>
                      ) : (
                        <input
                          className="p-inline p-inline-note"
                          value={it.note}
                          placeholder="备注"
                          onChange={(e) => setField(it.id, { note: sanitizeText(e.target.value, { multiline: false, max: 500 }) })}
                        />
                      )}
                    </td>
                    <td className="w-more">
                      {!done && (
                        <button
                          className="p-more"
                          onClick={(e) => {
                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const w = 168;
                            const x = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
                            const y = Math.min(r.bottom + 6, window.innerHeight - 230);
                            setMenu({ id: it.id, x, y });
                          }}
                        >⋯</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!catItems.length && (
                  <tr><td colSpan={10} className="p-empty-row">这个分类还没有物品</td></tr>
                )}
                {!done && activeCategory?.status === 'open' && (
                  <tr><td colSpan={10} className="p-add-row"><button onClick={addRow}>＋ 添加一行</button></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="tiny p-scroll-hint">
            {isDesktopLayout ? '格子里可直接填写名称、规格、单位、数量、单价、优先级、备注和链接；点附件列的「＋」上传图片。' : '表格可左右滑动，名称列固定在左侧；附件列可直接上传图片。'}
          </div>
          <div className="p-foot-hint">
            填完本分类后点右上角「完成本分类」；全部分类处理完才会出现「完成清单」。
          </div>
        </main>
      </div>

      <input ref={attachRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void onAttachFiles(e.target.files); e.target.value = ''; }} />
      <div style={{ height: 80 }} />
      <div className="p-actions">
        {done ? (
          <>
            <button className="btn grow" onClick={() => setConfirmKind('rollback')}>打回修改</button>
            <button className="btn primary grow" onClick={() => setConfirmKind('export')} disabled={busy}>
              <IconDownload size={17} /> {busy ? '导出中…' : '导出 Excel'}
            </button>
          </>
        ) : (
          <>
            <button className="btn grow" onClick={() => goCat(-1)}>上一分类</button>
            <button className="btn primary grow" onClick={() => goCat(1)} disabled={cats.findIndex((c) => c.name === activeCat) >= cats.length - 1}>
              下一分类
            </button>
          </>
        )}
      </div>

      {done && exported && (
        <button className="btn wide" style={{ marginTop: 8 }} onClick={() => setConfirmKind('new')}>＋ 新建下一份清单</button>
      )}

      {/* 详情编辑 */}
      <Sheet open={!!editing} onClose={cancelEditing} title={editing?.isNew ? '添加条目' : '编辑条目'} lead="名称、数量、单价也可以直接在表格里改">
        {editing && (
          <>
            <div className="card p-form">
              <label className="fld"><span>名称 <i>*</i></span>
                <input value={editing.item.name} onChange={(e) => setEditing({ ...editing, item: { ...editing.item, name: sanitizeText(e.target.value, { max: 60 }) } })} placeholder="例如：联想 ThinkPad P15" />
                {errors.find((e) => e.field === 'name') && <em className="err">{errors.find((e) => e.field === 'name')!.message}</em>}
              </label>
              <label className="fld"><span>规格</span>
                <textarea rows={3} value={editing.item.spec} onChange={(e) => setEditing({ ...editing, item: { ...editing.item, spec: sanitizeText(e.target.value, { multiline: true, max: 300 }) } })} placeholder="CPU / 内存 / 硬盘 / 型号等" />
              </label>
              <div className="row p-two">
                <label className="fld grow"><span>单位</span>
                  <input value={editing.item.unit} onChange={(e) => setEditing({ ...editing, item: { ...editing.item, unit: sanitizeUnit(e.target.value) } })} />
                </label>
                <label className="fld grow"><span>数量</span>
                  <input type="number" inputMode="decimal" value={editing.item.qty ?? ''} onChange={(e) => setEditing({ ...editing, item: { ...editing.item, qty: e.target.value === '' ? null : Number(e.target.value) } })} />
                </label>
                <label className="fld grow"><span>单价</span>
                  <input type="number" inputMode="decimal" value={editing.item.price ?? ''} onChange={(e) => setEditing({ ...editing, item: { ...editing.item, price: e.target.value === '' ? null : Number(e.target.value) } })} />
                </label>
              </div>
              <div className="p-subtotal">小计 <b>{itemTotal(editing.item) === null ? '—' : `¥${money(itemTotal(editing.item)!)}`}</b></div>
              <label className="fld"><span>优先级</span>
                <div className="chips">
                  {(['high', 'mid', 'low'] as PurchasePriority[]).map((p) => (
                    <button key={p} className={'chip' + (editing.item.priority === p ? ' on' : '')} onClick={() => setEditing({ ...editing, item: { ...editing.item, priority: p } })}>{PRIORITY_LABEL[p]}</button>
                  ))}
                </div>
              </label>
              <label className="fld"><span>购买链接</span>
                <input value={editing.item.link} onChange={(e) => setEditing({ ...editing, item: { ...editing.item, link: e.target.value } })} onBlur={() => setEditing({ ...editing, item: { ...editing.item, link: normalizeLink(editing.item.link) } })} placeholder="https://…" inputMode="url" />
                {errors.find((e) => e.field === 'link') && <em className="err">{errors.find((e) => e.field === 'link')!.message}</em>}
              </label>
              <label className="fld"><span>备注</span>
                <textarea rows={2} value={editing.item.note} onChange={(e) => setEditing({ ...editing, item: { ...editing.item, note: sanitizeText(e.target.value, { multiline: true, max: 500 }) } })} placeholder="选填" />
              </label>
              <div className="fld"><span>图片（最多 6 张）</span>
                <div className="p-imgs">
                  {editing.item.images.map((img) => (
                    <div key={img.id} className="p-img-wrap">
                      <ItemImg blobKey={img.blobKey} />
                      <button className="p-img-del" onClick={() => setEditing({ ...editing, item: { ...editing.item, images: editing.item.images.filter((x) => x.id !== img.id) } })}><IconClose size={12} /></button>
                    </div>
                  ))}
                  {editing.item.images.length < 6 && (
                    <button className="p-img-add" onClick={() => fileRef.current?.click()}><IconPlus size={18} /><span>添加</span></button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
              </div>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn grow" onClick={cancelEditing}>取消</button>
              <button className="btn primary grow" onClick={saveEditing}>保存</button>
            </div>
          </>
        )}
      </Sheet>

      {menu && (
        <>
          <div className="p-menu-backdrop" onClick={() => setMenu(null)} />
          <motion.div
            className="p-menu"
            style={{ left: menu.x, top: menu.y }}
            initial={{ opacity: 0, scale: 0.94, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
          >
            <button onClick={() => { const id = menu.id; setMenu(null); openDetail(id); }}>
              <IconBox size={16} /><span>编辑详情</span>
            </button>
            <button onClick={() => { const id = menu.id; setMenu(null); duplicate(id); }}>
              <IconCopy size={16} /><span>复制这一项</span>
            </button>
            <button onClick={() => { const id = menu.id; setMenu(null); move(id, -1); }}>
              <span className="p-menu-ico">↑</span><span>上移</span>
            </button>
            <button onClick={() => { const id = menu.id; setMenu(null); move(id, 1); }}>
              <span className="p-menu-ico">↓</span><span>下移</span>
            </button>
            <div className="p-menu-sep" />
            <button className="danger" onClick={() => { const id = menu.id; setMenu(null); setPendingDelete(id); setConfirmKind('delete'); }}>
              <IconTrash size={16} /><span>删除</span>
            </button>
          </motion.div>
        </>
      )}

      <Sheet open={addCatOpen} onClose={() => setAddCatOpen(false)} title="添加分类" lead="例如：会议室、软件、外包">
        <div className="card">
          <input
            value={newCat}
            onChange={(e) => setNewCat(sanitizeText(e.target.value, { max: 10 }))}
            placeholder="分类名称，最多 10 字"
            style={{ width: '100%', border: 0, background: 'rgba(120,120,128,.1)', borderRadius: 12, padding: '12px 14px', fontSize: 16 }}
          />
        </div>
        <button className="btn primary wide" onClick={addCategory} disabled={!newCat.trim()}>添加</button>
      </Sheet>

      <Sheet
        open={layoutAsk}
        onClose={() => { setSettings({ purchaseLayout: 'mobile' }); setLayoutAsk(false); }}
        title="窗口变窄了"
        lead="可以保持桌面表格（内容多时左右滑动），也可以切换成手机布局。之后可在设置里再改回。"
      >
        <div className="row" style={{ gap: 10 }}>
          <button className="btn grow" onClick={() => { setSettings({ purchaseLayout: 'desktop' }); setLayoutAsk(false); }}>保持桌面布局</button>
          <button className="btn primary grow" onClick={() => { setSettings({ purchaseLayout: 'mobile' }); setLayoutAsk(false); }}>切换手机布局</button>
        </div>
      </Sheet>

      <Confirm
        open={confirmKind === 'catDone'}
        title="完成本分类？"
        body={`「${activeCat}」共 ${catItems.length} 项，小计 ¥${money(catItems.reduce((s, i) => s + (itemTotal(i) ?? 0), 0))}。完成后仍可「打回本类」。`}
        confirmText="完成本类"
        onClose={() => setConfirmKind(null)}
        onConfirm={() => { setCategoryStatus(activeCat, 'done'); setConfirmKind(null); useStore.getState().showToast('本分类已完成'); }}
      />
      <Confirm
        open={confirmKind === 'catNone'}
        title="本分类没有采购？"
        body={`将把「${activeCat}」标记为无采购，不计入清单。之后可以「打回本类」恢复。`}
        confirmText="本类无采购"
        onClose={() => setConfirmKind(null)}
        onConfirm={() => { setCategoryStatus(activeCat, 'none'); setConfirmKind(null); useStore.getState().showToast('已标记本类无采购'); }}
      />
      <Confirm
        open={confirmKind === 'finish'}
        title="完成这份清单？"
        body={`共 ${items.length} 项，合计 ¥${money(total)}。完成后会锁定，需要时可「打回修改」。`}
        confirmText="确认完成"
        cancelText="再检查一下"
        onClose={() => setConfirmKind(null)}
        onConfirm={finish}
      />
      <Confirm
        open={confirmKind === 'rollback'}
        title="打回修改？"
        body="清单会解锁并回到草稿，可以继续编辑。已经导出的 Excel 不受影响。"
        confirmText="打回"
        onClose={() => setConfirmKind(null)}
        onConfirm={rollback}
      />
      <Confirm
        open={confirmKind === 'delete'}
        title="删除这一项？"
        body="删除后清单合计会同步变化。"
        confirmText="删除"
        danger
        onClose={() => { setConfirmKind(null); setPendingDelete(null); }}
        onConfirm={() => pendingDelete && deleteItem(pendingDelete)}
      />
      <Confirm
        open={confirmKind === 'export'}
        title="导出 Excel？"
        body={`共 ${items.length} 项，合计 ¥${money(total)}，将生成含图片的 Excel 文件。`}
        confirmText="导出"
        onClose={() => setConfirmKind(null)}
        onConfirm={() => void exportExcel()}
      />
      <Confirm
        open={confirmKind === 'new'}
        title="新建下一份？"
        body="当前清单会从编辑区移除，已导出的 Excel 保留在材料库。"
        confirmText="新建"
        onClose={() => setConfirmKind(null)}
        onConfirm={newList}
      />
    </div>
  );
}
