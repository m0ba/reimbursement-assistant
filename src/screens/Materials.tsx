import { useState } from 'react';
import { useStore } from '../lib/store';
import { deleteBlob, downloadBlob, fmtDate, getBlob } from '../lib/db';
import { BUILTIN_FILES } from '../lib/builtin';
import { Confirm, Sheet } from '../components/Sheet';
import { IconArchive, IconDownload, IconFolder, IconShare, IconTrash } from '../components/Icons';
import { EmptyState } from '../components/EmptyState';
import { listTotal } from '../lib/purchase';

export default function Materials() {
  const batches = useStore((s) => s.batches);
  const files = useStore((s) => s.files);
  const purchaseLists = useStore((s) => s.purchaseLists);
  const setView = useStore((s) => s.setView);
  const removeBatch = useStore((s) => s.removeBatch);
  const removeFile = useStore((s) => s.removeFile);
  const patchFile = useStore((s) => s.patchFile);
  const [target, setTarget] = useState<string | null>(null);
  const [fileTarget, setFileTarget] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [name, setName] = useState('');

  const remove = async (id: string) => {
    const b = useStore.getState().batches.find((x) => x.id === id);
    if (b) {
      const keys = [...(b.invoices || []).map((i) => i.blobKey), ...(b.images || []).map((i) => i.blobKey)];
      for (const k of keys) await deleteBlob(k);
    }
    removeBatch(id);
  };

  const current = files.find((f) => f.id === renameId);

  const reopenPurchase = (list: (typeof purchaseLists)[number]) => {
    useStore.getState().setPurchase({ ...list, done: false, doneAt: undefined, updatedAt: Date.now() });
    setView('purchase');
    useStore.getState().showToast('已打开采购清单，可以继续修改');
  };

  const downloadBuiltin = async (file: string, display: string, ext: string) => {
    const res = await fetch(`/builtin/${file}`);
    const blob = await res.blob();
    downloadBlob(blob, `${display}.${ext}`);
  };

  return (
    <div className="page">
      <div className="large-title">材料库</div>
      <div className="subtitle">
        内置表格、发票与轨迹记录、采购清单和已生成文件都放在这里，草稿可继续编辑，成品可随时下载或分享。
      </div>

      <div className="section-title">内置文件</div>
      <div className="list">
        {BUILTIN_FILES.map((f) => (
          <div className="list-item" key={f.id}>
            <div className="grow">
              <div className="title">{f.name}</div>
              <div className="meta">{f.desc} · {f.size}</div>
            </div>
            <button className="icon-btn" aria-label="下载" onClick={() => downloadBuiltin(f.file, f.name, f.ext)}>
              <IconDownload size={18} />
            </button>
          </div>
        ))}
      </div>
      <div className="tiny" style={{ margin: '8px 6px 0' }}>随程序更新，点右边按钮下载到手机。</div>

      {purchaseLists.length > 0 && (
        <>
          <div className="section-title">采购清单历史 <span className="n">{purchaseLists.length}</span></div>
          <div className="tiny" style={{ margin: '-2px 6px 8px' }}>草稿和已完成的清单都会保留，可随时再编辑。</div>
          <div className="list">
            {purchaseLists.map((list) => (
              <div className="list-item" key={list.id}>
                <div className="grow">
                  <div className="row" style={{ gap: 6 }}>
                    <div className="title">{list.name}</div>
                    <span className={'chip ' + (list.done ? 'ok' : 'warn')}>{list.done ? '已完成' : '草稿'}</span>
                  </div>
                  <div className="meta">
                    {list.items.length} 项 · ¥{listTotal(list).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {fmtDate(list.updatedAt)}
                  </div>
                </div>
                <button className="dl-btn tint" onClick={() => reopenPurchase(list)}>再编辑</button>
              </div>
            ))}
          </div>
        </>
      )}

      {batches.length === 0 && files.length === 0 && purchaseLists.length === 0 && (
        <>
          <div className="section-title">我的材料</div>
          <div className="card">
            <EmptyState
              icon={<IconFolder size={22} />}
              title="还没有任何材料"
              hint="导入发票、轨迹图或创建采购清单后，记录和成品都会出现在这里"
            />
          </div>
        </>
      )}

      {batches.length > 0 && (
        <>
          <div className="section-title">导入历史 <span className="n">{batches.length}</span></div>
          <div className="tiny" style={{ margin: '-2px 6px 8px' }}>按时间倒序，点进去还能接着处理。</div>
        </>
      )}

      {batches.map((b) => {
        const n = b.kind === 'invoice' ? b.invoices?.length || 0 : b.images?.length || 0;
        const unresolved =
          b.kind === 'invoice'
            ? (b.invoices || []).filter((i) => i.status === 'failed').length
            : (b.images || []).filter((i) => i.status === 'unknown').length;
        return (
          <div className="card" key={b.id}>
            <div className="row between">
              <div className="grow" onClick={() => setView(b.kind === 'invoice' ? 'invoices' : 'trajectory', b.id)}>
                <div className="row" style={{ gap: 6 }}>
                  <div style={{ fontWeight: 600 }}>{b.kind === 'invoice' ? '发票批次' : '轨迹批次'} · {n} 个</div>
                  {b.done ? <span className="chip ok">已完成</span> : <span className="chip warn">草稿</span>}
                </div>
                <div className="tiny">{fmtDate(b.createdAt)} {b.mode ? ` · ${b.mode === 'layout' ? '仅拼版' : b.mode === 'info' ? '含信息表' : '含校验'}` : ''}</div>
                {unresolved > 0 && <div className="tiny" style={{ color: '#b26a00', marginTop: 2 }}>{unresolved} 个未识别</div>}
              </div>
              <button className="icon-btn" onClick={() => setTarget(b.id)} aria-label="删除">
                <IconTrash size={18} />
              </button>
            </div>
          </div>
        );
      })}

      {(batches.length > 0 || files.length > 0) && (
        <>
          <div className="section-title">已生成的文件 {files.length > 0 && <span className="n">{files.length}</span>}</div>
          {files.length > 0 && <div className="tiny" style={{ margin: '-2px 6px 8px' }}>默认按生成时间命名，点名字可以改。</div>}
          {files.length === 0 && (
            <div className="card">
              <EmptyState
                icon={<IconArchive size={22} />}
                title="还没有生成文件"
                hint="发票拼版、信息表、轨迹图导出后都会出现在这里。"
              />
            </div>
          )}
        </>
      )}
      {files.map((f) => (
        <div className="card" key={f.id}>
          <div className="row between">
            <div className="grow" onClick={() => { setRenameId(f.id); setName(f.name); }}>
              <div style={{ fontWeight: 600 }}>{f.name}</div>
              <div className="tiny">
                {f.ext.toUpperCase()} · {fmtDate(f.createdAt)}{f.pages ? ` · ${f.pages} 页` : ''}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="icon-btn"
                aria-label="下载"
                onClick={async () => {
                  const blob = await getBlob(f.blobKey);
                  if (blob) downloadBlob(blob, `${f.name}.${f.ext}`);
                }}
              >
                <IconDownload size={18} />
              </button>
              <button
                className="icon-btn"
                aria-label="分享"
                onClick={async () => {
                  const blob = await getBlob(f.blobKey);
                  if (!blob) return;
                  const file = new File([blob], `${f.name}.${f.ext}`, { type: blob.type });
                  if ((navigator as any).canShare?.({ files: [file] })) {
                    await (navigator as any).share({ files: [file] });
                  } else {
                    downloadBlob(blob, `${f.name}.${f.ext}`);
                  }
                }}
              >
                <IconShare size={18} />
              </button>
              <button className="icon-btn" aria-label="删除" onClick={() => setFileTarget(f.id)}>
                <IconTrash size={18} />
              </button>
            </div>
          </div>
        </div>
      ))}

      <Confirm
        open={!!target}
        title="删除这批材料？"
        body="原始文件与识别结果都会从本机删除，已生成的成品仍保留在文件库。此操作不可恢复。"
        confirmText="删除"
        danger
        onClose={() => setTarget(null)}
        onConfirm={() => {
          if (target) void remove(target);
          setTarget(null);
        }}
      />

      <Confirm
        open={!!fileTarget}
        title="删除这个文件？"
        body="只会删除本机保存的成品，原始材料与批次记录保留。"
        confirmText="删除"
        danger
        onClose={() => setFileTarget(null)}
        onConfirm={async () => {
          if (fileTarget) {
            const f = files.find((x) => x.id === fileTarget);
            if (f) {
              await deleteBlob(f.blobKey);
              removeFile(f.id);
            }
          }
          setFileTarget(null);
        }}
      />

      <Sheet open={!!current} onClose={() => setRenameId(null)} title="重命名" lead="留空则恢复为生成时间命名">
        <div className="card">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', border: 0, background: 'rgba(120,120,128,.1)', borderRadius: 12, padding: 12, fontSize: 16 }}
          />
        </div>
        <button
          className="btn primary wide"
          onClick={() => {
            if (current) patchFile(current.id, { name: name.trim() || current.name });
            setRenameId(null);
          }}
        >
          保存
        </button>
      </Sheet>
    </div>
  );
}
