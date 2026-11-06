import type { InvoiceItem } from './types';

export function invoiceInfoText(item: Pick<InvoiceItem, 'goodsName' | 'seller'>): string {
  const seller = item.seller?.trim();
  const parts: string[] = [];
  if (seller) parts.push(`销售方：${seller}`);
  if (item.goodsName?.trim()) parts.push(item.goodsName.trim());
  return parts.join('；');
}

export function invoiceInfoPreview(value: string, limit = 20): string {
  const chars = Array.from(value.trim());
  return chars.length > limit ? `${chars.slice(0, limit).join('')}…` : chars.join('');
}

export function invoiceGoodsPreview(item: Pick<InvoiceItem, 'goodsName'>, limit = 20): string {
  return invoiceInfoPreview(item.goodsName?.trim() || '', limit);
}
