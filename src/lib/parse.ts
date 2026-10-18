import type { InvoiceCategory } from './types';

export interface ParsedInvoice {
  number?: string;
  date?: string;
  amount?: number;
  seller?: string;
  buyer?: string;
  category: InvoiceCategory;
  ok: boolean;
  routeFrom?: string;
  routeTo?: string;
  trainNo?: string;
  departAt?: string;
}

const TAX_ID = /^[0-9A-Z]{18}$/;

export function parseInvoiceText(raw: string): ParsedInvoice {
  const text = raw.replace(/\u00a0/g, ' ');
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const flat = text.replace(/\s+/g, ' ');

  let number = (flat.match(/(?<!\d)\d{20}(?!\d)/) || [])[0];
  if (!number) {
    const m = flat.match(/发票号码[:：]?\s*([0-9]{8,20})/);
    if (m) number = m[1];
  }

  let date: string | undefined;
  const dm =
    flat.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/) ||
    flat.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (dm) {
    date = `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}`;
  }

  const amounts: number[] = [];
  for (const m of flat.matchAll(/[¥￥]\s*([\d,]+\.\d{1,2})/g)) {
    amounts.push(Number(m[1].replace(/,/g, '')));
  }
  for (const m of flat.matchAll(/([\d,]+\.\d{2})\s*元/g)) {
    amounts.push(Number(m[1].replace(/,/g, '')));
  }
  let amount: number | undefined = amounts.length ? Math.max(...amounts) : undefined;

  let buyer: string | undefined;
  let seller: string | undefined;

  // 票面常见“名称：买方名称名称：卖方名称”同处一行
  const names: string[] = [];
  for (const line of lines) {
    const parts = line.split(/名称[:：]/).slice(1);
    for (const p of parts) {
      const v = p.replace(/^\s+/, '').trim();
      if (v) names.push(v);
    }
  }
  const cleanName = (v: string) =>
    v.replace(/(统一社会信用代码|纳税人识别号|名\s*称).*$/, '').trim();
  buyer = names[0] ? cleanName(names[0]) : undefined;
  seller = names[1] ? cleanName(names[1]) : undefined;

  if (!seller || !buyer) {
    const taxIdx = lines.map((l, i) => (TAX_ID.test(l) ? i : -1)).filter((i) => i >= 0);
    if (taxIdx.length >= 2) {
      buyer = buyer || cleanName(lines[taxIdx[0] - 1] || '');
      seller = seller || cleanName(lines[taxIdx[1] - 1] || '');
    }
  }
  const clean = (s?: string) => (s ? s.replace(/^名称[:：]\s*/, '').replace(/^(购|销)买?方.*$/, '').trim() || undefined : undefined);
  buyer = clean(buyer);
  seller = clean(seller);

  const category = classify(flat, seller || '');

  if (category === '火车' && (!seller || seller.length > 20)) seller = '中国铁路';

  let routeFrom: string | undefined;
  let routeTo: string | undefined;
  let trainNo: string | undefined;
  let departAt: string | undefined;
  if (category === '火车') {
    const r = text.match(/([^\s|]+?)站[\s|]+([GDCZTKZ]?\d{1,4})([^\s|]+?)站/);
    if (r) {
      routeFrom = r[1];
      trainNo = r[2];
      routeTo = r[3];
    }
    const d = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2}):(\d{2})\s*开/);
    if (d) {
      departAt = `${d[1]}-${String(d[2]).padStart(2, '0')}-${String(d[3]).padStart(2, '0')} ${String(d[4]).padStart(2, '0')}:${d[5]}`;
    }
  }

  return {
    number,
    date,
    amount,
    seller,
    buyer,
    category,
    ok: Boolean(number && amount !== undefined),
    routeFrom,
    routeTo,
    trainNo,
    departAt,
  };
}

export function classify(text: string, seller: string): InvoiceCategory {
  if (/住宿服务|住宿费|客房|房费/.test(text) || /酒店|宾馆|客栈|旅馆|民宿/.test(seller + text.slice(0, 0))) return '住宿';
  if (/铁路电子客票|电子客票|车次|二等座|一等座|商务座|火车票/.test(text)) return '火车';
  if (/出租汽车|客运服务费|网约车|打车|巡游出租/.test(text)) return '打车';
  if (/酒店|宾馆|客栈|旅馆|民宿/.test(text)) return '住宿';
  return '其他';
}
