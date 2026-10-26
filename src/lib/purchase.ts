import { uid } from './db';
import type { PurchaseCategory, PurchaseItem, PurchaseList, PurchasePriority } from './types';

export const PURCHASE_CATEGORIES = ['设备', '耗材', '网络', '办公', '其他'];
export const PURCHASE_UNITS = ['个', '件', '台', '套', '箱', '包', '卷', '米', '公斤'];
export const PRIORITY_LABEL: Record<PurchasePriority, string> = { high: '高', mid: '中', low: '低' };
export const PRIORITY_COLOR: Record<PurchasePriority, string> = { high: '#ff3b30', mid: '#ff9f0a', low: '#8e8e93' };

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const FORMULA_START = /^[=+\-@]/;

export function todayName() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 采购清单`;
}

export function createPurchaseItem(): PurchaseItem {
  return {
    id: uid('pi'),
    category: '设备',
    name: '',
    spec: '',
    unit: '个',
    qty: 1,
    price: null,
    priority: 'mid',
    link: '',
    note: '',
    images: [],
  };
}

export function createPurchaseList(): PurchaseList {
  const categories: PurchaseCategory[] = PURCHASE_CATEGORIES.map((name) => ({ name, status: 'open' }));
  return {
    id: uid('pl'),
    name: todayName(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    done: false,
    items: [],
    categories,
  };
}

export function ensureCategories(list: PurchaseList): PurchaseList {
  if (list.categories?.length) return list;
  const names = new Set<string>(PURCHASE_CATEGORIES);
  for (const it of list.items || []) if (it.category) names.add(it.category);
  return { ...list, categories: Array.from(names).map((name) => ({ name, status: 'open' as const })) };
}

export function categoryResolved(c: PurchaseCategory) {
  return c.status === 'done' || c.status === 'none';
}

export function sanitizeText(value: string, opts: { multiline?: boolean; max?: number } = {}) {
  let v = String(value ?? '').replace(CONTROL, '');
  if (!opts.multiline) v = v.replace(/[\r\n]+/g, ' ');
  v = opts.multiline ? v.replace(/[ \t]{2,}/g, ' ') : v.replace(/\s{2,}/g, ' ');
  v = v.trimStart();
  if (opts.max && v.length > opts.max) v = v.slice(0, opts.max);
  return v;
}

export function sanitizeUnit(value: string) {
  return sanitizeText(value, { max: 8 }).replace(/[^\u4e00-\u9fa5A-Za-z0-9·%]/g, '');
}

export function normalizeLink(value: string) {
  const v = sanitizeText(value, { max: 2000 }).replace(/\s+/g, '');
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) return v;
  try {
    const u = new URL(v);
    return u.toString();
  } catch {
    return v;
  }
}

export function itemTotal(item: PurchaseItem) {
  if (item.qty === null || item.price === null) return null;
  return Math.round(item.qty * item.price * 100) / 100;
}

export function listTotal(list: PurchaseList) {
  return list.items.reduce((sum, it) => sum + (itemTotal(it) ?? 0), 0);
}

export function groupByCategory(list: PurchaseList) {
  const map = new Map<string, PurchaseItem[]>();
  for (const it of list.items) {
    const key = it.category?.trim() || '其他';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  return Array.from(map.entries()).map(([category, items]) => ({
    category,
    items,
    total: items.reduce((s, it) => s + (itemTotal(it) ?? 0), 0),
  }));
}

export type ItemError = { field: keyof PurchaseItem; message: string };

export function validateItem(item: PurchaseItem, index: number): ItemError[] {
  const errs: ItemError[] = [];
  const prefix = `第 ${index + 1} 项`;
  const name = item.name.trim();
  if (!name) errs.push({ field: 'name', message: `${prefix}缺少名称` });
  else if (name.length > 60) errs.push({ field: 'name', message: `${prefix}名称过长` });
  else if (FORMULA_START.test(name)) errs.push({ field: 'name', message: `${prefix}名称不能以 = + - @ 开头` });
  if (item.spec.length > 300) errs.push({ field: 'spec', message: `${prefix}规格过长` });
  if (!item.unit.trim()) errs.push({ field: 'unit', message: `${prefix}缺少单位` });
  else if (!/^[\u4e00-\u9fa5A-Za-z0-9·%]{1,8}$/.test(item.unit.trim())) errs.push({ field: 'unit', message: `${prefix}单位含不支持的字符` });
  if (item.qty === null || !Number.isFinite(item.qty)) errs.push({ field: 'qty', message: `${prefix}数量不是数字` });
  else if (item.qty <= 0) errs.push({ field: 'qty', message: `${prefix}数量需大于 0` });
  else if (item.qty > 99999) errs.push({ field: 'qty', message: `${prefix}数量过大` });
  if (item.price !== null) {
    if (!Number.isFinite(item.price) || item.price < 0) errs.push({ field: 'price', message: `${prefix}单价不合法` });
    else if (item.price > 9999999.99) errs.push({ field: 'price', message: `${prefix}单价过大` });
  }
  if (item.link && !/^https?:\/\/[^\s]+$/i.test(item.link)) errs.push({ field: 'link', message: `${prefix}链接格式不对` });
  if (item.note.length > 500) errs.push({ field: 'note', message: `${prefix}备注过长` });
  return errs;
}

export function validateList(list: PurchaseList): ItemError[] {
  if (!list.items.length) return [{ field: 'name', message: '清单还没有条目' }];
  return list.items.flatMap((it, i) => validateItem(it, i));
}

export function escapeFormula(value: string) {
  const v = String(value ?? '');
  return FORMULA_START.test(v) ? `'${v}` : v;
}
