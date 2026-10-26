import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useStore } from '../lib/store';
import { Confirm, Sheet } from '../components/Sheet';
import { IconBack, IconCheck, IconDownload, IconPlus, IconTrash, IconCopy, IconBox, IconClose } from '../components/Icons';
import { putBlob, uid, stamp, downloadBlob } from '../lib/db';
import { useBlobUrl } from '../components/PdfThumb';
import type { PurchaseItem, PurchasePriority } from '../lib/types';
import {
  createPurchaseItem, createPurchaseList, groupByCategory, itemTotal, listTotal,
  normalizeLink, sanitizeText, sanitizeUnit, validateItem, validateList, PRIORITY_COLOR, PRIORITY_LABEL,
  PURCHASE_CATEGORIES, PURCHASE_UNITS, type ItemError,
} from '../lib/purchase';
import { buildPurchaseXlsx } from '../lib/purchaseExcel';

const money = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Thumb({ item }: { item: PurchaseItem }) {
  const first = item.images[0];
  return <>{first ? <ItemImg blobKey={first.blobKey} /> : null}</>;
}

function ItemImg({ blobKey }: { blobKey: string }) {
  const url = useBlobUrl(blobKey);
  return url ? <img src={url} alt="" className="p-thumb" /> : <div className="p-thumb shimmer" />;
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
  const setPurchase = useStore((s) => s.setPurchase);
  const patchPurchase = useStore((s) => s.patchPurchase);
  const setView = useStore((s) => s.setView);
  const [editing, setEditing] = useState<{ index: number; item: PurchaseItem; isNew?: boolean } | null>(null);
  const [errors, setErrors] = useState<ItemError[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<null | 'finish' | 'rollback' | 'delete' | 'clear' | 'export' | 'new'>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const items = purchase?.items || [];
  const total = purchase ? listTotal(purchase) : 0;
  const groups = useMemo(() => (purchase ? groupByCategory(purchase) : []), [purchase]);

  useEffect(() => {
    if (purchase) return;
    const native = Capacitor.isNativePlatform();
    if (native && !sessionStorage.getItem('purchase-mobile-hint')) {
      sessionStorage.setItem('purchase-mobile-hint', '1');
      setHintOpen(true);
    }
  }, [purchase]);

  const start = () => {
    const list = createPurchaseList();
    setPurchase(list);
    setEditing({ index: 0, item: list.items[0], isNew: true });
  };

  const openItem = (index: number) => {
    if (purchase?.done) return;
    setEditing({ index, item: { ...items[index], images: [...items[index].images] } });
    setErrors([]);
  };

  const saveEditing = () => {
    if (!editing || !purchase) return;
    const it = editing.item;
    const errs = validateItem(it, editing.index);
    if (errs.length) {
      setErrors(errs);
      useStore.getState().showToast(errs[0].message);
      return;
    }
    const next = [...purchase.items];
    next[editing.index] = it;
    patchPurchase({ items: next });
    setEditing(null);
    setErrors([]);
  };

  const addItem = () => {
    if (!purchase) return;
    const it = createPurchaseItem();
    patchPurchase({ items: [...purchase.items, it] });
    setEditing({ index: purchase.items.length, item: it, isNew: true });
  };

  const duplicate = (id: string) => {
    if (!purchase) return;
    const idx = purchase.items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const copy: PurchaseItem = { ...purchase.items[idx], id: uid('pi'), images: [...purchase.items[idx].images] };
    const next = [...purchase.items];
    next.splice(idx + 1, 0, copy);
    patchPurchase({ items: next });
    useStore.getState().showToast('已复制这一项');
  };

  const move = (id: string, dir: -1 | 1) => {
    if (!purchase) return;
    const idx = purchase.items.findIndex((i) => i.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= purchase.items.length) return;
    const next = [...purchase.items];
    [next[idx], next[to]] = [next[to], next[idx]];
    patchPurchase({ items: next });
  };

  const deleteItem = (id: string) => {
    if (!purchase) return;
    const item = purchase.items.find((i) => i.id === id);
    const next = purchase.items.filter((i) => i.id !== id);
    patchPurchase({ items: next });
    setPendingDelete(null);
    setConfirmKind(null);
    useStore.getState().showToast(`已删除「${item?.name || '未命名'}」`);
  };

  const finish = () => {
    if (!purchase) return;
    const errs = validateList(purchase);
    if (errs.length) {
      setErrors(errs);
      setConfirmKind(null);
      setMenuFor(null);
      useStore.getState().showToast(errs[0].message);
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
      useStore.getState().addFile({
        id: uid('lib'),
        name: name.replace(/\.xlsx$/, ''),
        blobKey: key,
        ext: 'xlsx',
        createdAt: Date.now(),
        bytes: blob.size,
      });
      await downloadBlob(blob, name);
      setConfirmKind(null);
      setExported(true);
    } catch (e) {
      useStore.getState().showToast('导出失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const newList = () => {
    setPurchase(null);
    setConfirmKind(null);
    setEditing(null);
    setExported(false);
  };

  const cancelEditing = () => {
    if (!editing || !purchase) {
      setEditing(null);
      return;
    }
    const it = editing.item;
    const blank = !it.name.trim() && !it.spec.trim() && !it.note.trim() && !it.link.trim() && it.images.length === 0;
    if (editing.isNew && blank) {
      patchPurchase({ items: purchase.items.filter((x) => x.id !== it.id) });
    }
    setEditing(null);
  };

  const pickImages = () => fileRef.current?.click();

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

  // ---------------- 编辑页 ----------------
  if (editing) {
    const it = editing.item;
    const set = (patch: Partial<PurchaseItem>) => setEditing({ ...editing, item: { ...it, ...patch } });
    const err = (f: keyof PurchaseItem) => errors.find((e) => e.field === f)?.message;
    return (
      <div className="page purchase-page">
        <div className="p-edit-top">
          <button className="icon-btn" onClick={cancelEditing} aria-label="返回">
            <IconBack />
          </button>
          <span className="p-edit-title">{editing.index < items.length ? '编辑条目' : '添加条目'}</span>
          <button className="btn primary p-save" onClick={saveEditing}>保存</button>
        </div>

        <div className="card p-form">
          <label className="fld"><span>分类</span>
            <div className="chips">
              {PURCHASE_CATEGORIES.map((c) => (
                <button key={c} className={'chip' + (it.category === c ? ' on' : '')} onClick={() => set({ category: c })}>{c}</button>
              ))}
            </div>
            <input value={it.category} onChange={(e) => set({ category: sanitizeText(e.target.value, { max: 10 }) })} placeholder="或输入自定义分类" />
          </label>

          <label className="fld"><span>名称 <i>*</i></span>
            <input value={it.name} onChange={(e) => set({ name: sanitizeText(e.target.value, { max: 60 }) })} placeholder="例如：联想 ThinkPad P15" />
            {err('name') && <em className="err">{err('name')}</em>}
          </label>

          <label className="fld"><span>规格</span>
            <textarea rows={3} value={it.spec} onChange={(e) => set({ spec: sanitizeText(e.target.value, { multiline: true, max: 300 }) })} placeholder="CPU / 内存 / 硬盘 / 型号等" />
          </label>

          <label className="fld"><span>单位</span>
            <div className="chips">
              {PURCHASE_UNITS.map((u) => (
                <button key={u} className={'chip' + (it.unit === u ? ' on' : '')} onClick={() => set({ unit: u })}>{u}</button>
              ))}
            </div>
            <input value={it.unit} onChange={(e) => set({ unit: sanitizeUnit(e.target.value) })} placeholder="个" />
            {err('unit') && <em className="err">{err('unit')}</em>}
          </label>

          <div className="row p-two">
            <label className="fld grow"><span>数量</span>
              <input type="number" inputMode="decimal" min={0} step="0.01" value={it.qty ?? ''} onChange={(e) => set({ qty: e.target.value === '' ? null : Number(e.target.value) })} />
              {err('qty') && <em className="err">{err('qty')}</em>}
            </label>
            <label className="fld grow"><span>单价（元）</span>
              <input type="number" inputMode="decimal" min={0} step="0.01" value={it.price ?? ''} onChange={(e) => set({ price: e.target.value === '' ? null : Number(e.target.value) })} />
              {err('price') && <em className="err">{err('price')}</em>}
            </label>
          </div>

          <div className="p-subtotal">小计 <b>{itemTotal(it) === null ? '—' : `¥${money(itemTotal(it)!)}`}</b></div>

          <label className="fld"><span>优先级</span>
            <div className="chips">
              {(['high', 'mid', 'low'] as PurchasePriority[]).map((p) => (
                <button key={p} className={'chip' + (it.priority === p ? ' on' : '')} onClick={() => set({ priority: p })}>{PRIORITY_LABEL[p]}</button>
              ))}
            </div>
          </label>

          <label className="fld"><span>购买链接</span>
            <input value={it.link} onChange={(e) => set({ link: e.target.value })} onBlur={() => set({ link: normalizeLink(it.link) })} placeholder="https://…" inputMode="url" />
            {err('link') && <em className="err">{err('link')}</em>}
            {it.link && (
              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                <button className="dl-btn" onClick={() => window.open(it.link, '_blank', 'noopener')}>打开</button>
                <button className="dl-btn" onClick={() => navigator.clipboard.writeText(it.link).then(() => useStore.getState().showToast('链接已复制'))}>复制</button>
              </div>
            )}
          </label>

          <label className="fld"><span>备注</span>
            <textarea rows={2} value={it.note} onChange={(e) => set({ note: sanitizeText(e.target.value, { multiline: true, max: 500 }) })} placeholder="选填" />
          </label>

          <div className="fld"><span>图片（最多 6 张）</span>
            <div className="p-imgs">
              {it.images.map((img) => (
                <div key={img.id} className="p-img-wrap">
                  <ItemImg blobKey={img.blobKey} />
                  <button className="p-img-del" onClick={() => set({ images: it.images.filter((x) => x.id !== img.id) })} aria-label="删除图片"><IconClose size={12} /></button>
                </div>
              ))}
              {it.images.length < 6 && (
                <button className="p-img-add" onClick={pickImages}><IconPlus size={18} /><span>添加</span></button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>
    );
  }

  // ---------------- 清单页 ----------------
  return (
    <div className="page purchase-page">
      {!purchase && (
        <div className="card">
          <div className="p-empty">
            <span className="p-empty-ico"><IconBox size={22} /></span>
            <div style={{ fontWeight: 600, marginTop: 10 }}>还没有采购清单</div>
            <div className="tiny" style={{ marginTop: 4 }}>一次只维护一份，填完点「完成」再导出 Excel</div>
          </div>
          <button className="btn primary wide" style={{ marginTop: 14 }} onClick={start}>
            <IconPlus size={18} /> 开始填写
          </button>
        </div>
      )}

      {purchase && (
        <>
          <div className="card">
            <div className="row between">
              <input
                className="p-name"
                value={purchase.name}
                disabled={purchase.done}
                onChange={(e) => patchPurchase({ name: sanitizeText(e.target.value, { max: 40 }) })}
                aria-label="清单名称"
              />
              <span className={'chip ' + (purchase.done ? 'ok' : 'warn')}>{purchase.done ? '已完成' : '草稿'}</span>
            </div>
            <div className="p-sum">
              <span>{items.length} 项</span>
              <b>¥{money(total)}</b>
            </div>
            {purchase.done && <div className="tiny" style={{ marginTop: 6 }}>已完成，如需修改请点「打回修改」</div>}
          </div>

          {groups.map((g) => (
            <div key={g.category} className="card p-group">
              <div className="row between p-group-head">
                <span>{g.category} · {g.items.length} 项</span>
                <b>¥{money(g.total)}</b>
              </div>
              {g.items.map((it) => {
                const idx = items.findIndex((x) => x.id === it.id);
                return (
                  <div key={it.id} className="p-item">
                    <i className="p-prio" style={{ background: PRIORITY_COLOR[it.priority] }} />
                    <button className="p-item-main" onClick={() => openItem(idx)} disabled={purchase.done}>
                      <div className="p-item-name">{it.name || '未命名'}</div>
                      <div className="p-item-spec">{it.spec || '—'}</div>
                      <div className="p-item-meta">
                        {it.qty ?? '—'} × {it.price === null ? '未填单价' : `¥${money(it.price)}`}
                        {it.link && <span className="p-dot" />}{it.link && '链接'}
                        {it.images.length > 0 && <><span className="p-dot" />{it.images.length} 图</>}
                      </div>
                    </button>
                    <div className="p-item-right">
                      <b>{itemTotal(it) === null ? '—' : `¥${money(itemTotal(it)!)}`}</b>
                      {!purchase.done && (
                        <button className="p-more" onClick={() => setMenuFor(it.id)} aria-label="更多">⋯</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {purchase.done && exported && (
            <button className="btn wide" style={{ marginTop: 4 }} onClick={() => setConfirmKind('new')}>
              <IconPlus size={18} /> 新建下一份清单
            </button>
          )}

          {!purchase.done && items.length > 0 && (
            <button
              className="btn wide"
              style={{ marginTop: 4, color: 'var(--red)', background: 'rgba(255,59,48,.08)' }}
              onClick={() => setConfirmKind('clear')}
            >
              清空清单
            </button>
          )}

          <div style={{ height: 96 }} />
          <div className="p-actions">
            {!purchase.done ? (
              <>
                <button className="btn grow" onClick={addItem}>添加一项</button>
                <button className="btn primary grow" onClick={() => setConfirmKind('finish')} disabled={!items.length}>完成</button>
              </>
            ) : (
              <>
                <button className="btn grow" onClick={() => setConfirmKind('rollback')}>打回修改</button>
                <button className="btn primary grow" onClick={() => setConfirmKind('export')} disabled={busy}>
                  <IconDownload size={17} /> {busy ? '导出中…' : '导出 Excel'}
                </button>
              </>
            )}
          </div>
        </>
      )}

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title="这一项">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <button className="list-item" onClick={() => { if (menuFor) duplicate(menuFor); setMenuFor(null); }}>
            <IconCopy size={18} /><span className="grow" style={{ textAlign: 'left' }}>复制这一项</span>
          </button>
          <button className="list-item" onClick={() => { if (menuFor) move(menuFor, -1); setMenuFor(null); }}>
            <span className="grow" style={{ textAlign: 'left' }}>上移</span>
          </button>
          <button className="list-item" onClick={() => { if (menuFor) move(menuFor, 1); setMenuFor(null); }}>
            <span className="grow" style={{ textAlign: 'left' }}>下移</span>
          </button>
          <button className="list-item" onClick={() => { setPendingDelete(menuFor); setMenuFor(null); setConfirmKind('delete'); }}>
            <IconTrash size={18} /><span className="grow" style={{ textAlign: 'left', color: 'var(--red)' }}>删除</span>
          </button>
        </div>
      </Sheet>

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
      <Confirm
        open={confirmKind === 'clear'}
        title="清空整份清单？"
        body="所有条目都会被删除，且不会保留草稿。"
        confirmText="全部清空"
        danger
        onClose={() => setConfirmKind(null)}
        onConfirm={() => {
          patchPurchase({ items: [] });
          setConfirmKind(null);
          useStore.getState().showToast('清单已清空');
        }}
      />

      <Sheet open={hintOpen} onClose={() => setHintOpen(false)} title="建议在电脑上填写" lead="采购清单字段较多，电脑上排版更宽松、录入更快。手机上也可以继续用。">
        <div className="row" style={{ gap: 10 }}>
          <button className="btn grow" onClick={() => setHintOpen(false)}>继续用手机</button>
          <button className="btn primary grow" onClick={() => { setHintOpen(false); setView('settings'); }}>去下载电脑版</button>
        </div>
      </Sheet>
    </div>
  );
}
