import { motion } from 'framer-motion';
import { useStore } from '../lib/store';
import { IconBox, IconFolder, IconInvoice, IconRoute } from '../components/Icons';

const tiles = [
  { id: 'invoices', name: '发票整理', hint: '导入即出 A4 拼版', Icon: IconInvoice },
  { id: 'trajectory', name: '轨迹图', hint: '按时间排 20 张/页', Icon: IconRoute },
  { id: 'materials', name: '材料库', hint: '贴签单与历史材料', Icon: IconFolder },
  { id: 'dev1', name: '待开发', hint: '即将上线', Icon: IconBox, placeholder: true },
] as const;

export default function Home() {
  const setView = useStore((s) => s.setView);
  const batches = useStore((s) => s.batches);

  const invoiceIssues = batches
    .filter((b) => b.kind === 'invoice')
    .flatMap((b) => b.invoices || [])
    .filter((i) => i.status === 'failed').length;
  const trajIssues = batches
    .filter((b) => b.kind === 'trajectory')
    .flatMap((b) => b.images || [])
    .filter((i) => i.status === 'unknown').length;

  return (
    <div className="page">
      <div className="large-title">报销助手</div>
      <div className="subtitle">所有文件只在本机处理，不上传</div>
      <div className="grid">
        {tiles.map((t, idx) => {
          const badge = t.id === 'invoices' ? invoiceIssues : t.id === 'trajectory' ? trajIssues : 0;
          return (
            <motion.button
              key={t.id}
              className={'tile' + ('placeholder' in t && t.placeholder ? ' placeholder' : '')}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                if (t.id === 'dev1') {
                  useStore.getState().showToast('即将上线');
                  return;
                }
                setView(t.id as any, null);
              }}
            >
              {badge > 0 && <span className="badge-count">{badge}</span>}
              <span className="glyph">
                <t.Icon size={22} />
              </span>
              <span>
                <div className="name">{t.name}</div>
                <div className="hint">{t.hint}</div>
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
