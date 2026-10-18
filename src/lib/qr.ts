import jsQR from 'jsqr';
import { openPdf, renderPageToCanvas } from './pdfdoc';

export interface QrResult {
  state: 'ok' | 'mismatch' | 'unavailable';
  number?: string;
  amount?: number;
  note: string;
}

function pickPayload(payload: string): { number?: string; amount?: number } {
  const num = payload.match(/(?<!\d)\d{20}(?!\d)/)?.[0];
  let amount: number | undefined;
  const am = payload.match(/(?:^|[,&=])(\d{1,7}\.\d{2})(?:[,&]|$)/);
  if (am) amount = Number(am[1]);
  return { number: num, amount };
}

export async function verifyInvoiceQr(
  bytes: ArrayBuffer,
  expectedNumber?: string,
  expectedAmount?: number,
): Promise<QrResult> {
  try {
    const doc = await openPdf(bytes);
    let code: ReturnType<typeof jsQR> = null;
    for (const scale of [2.2, 3.2, 4.2]) {
      const canvas = await renderPageToCanvas(doc, 1, scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
      if (code?.data) break;
    }
    if (!code || !code.data) {
      return { state: 'unavailable', note: '未找到二维码' };
    }
    const { number, amount } = pickPayload(code.data);
    if (!number && amount === undefined) {
      return { state: 'unavailable', note: '二维码内容不含可核对字段' };
    }
    const numOk = expectedNumber && number ? expectedNumber === number : null;
    const amtOk =
      expectedAmount !== undefined && amount !== undefined ? Math.abs(expectedAmount - amount) <= 0.01 : null;
    if (numOk === false || amtOk === false) {
      const parts: string[] = [];
      if (numOk === false) parts.push(`号码 文字层 ${expectedNumber} / 二维码 ${number}`);
      if (amtOk === false) parts.push(`金额 文字层 ${expectedAmount?.toFixed(2)} / 二维码 ${amount?.toFixed(2)}`);
      return { state: 'mismatch', number, amount, note: parts.join('；') };
    }
    if (numOk === null && amtOk === null) {
      return { state: 'unavailable', number, amount, note: '二维码无法与票面字段对应' };
    }
    return {
      state: 'ok',
      number,
      amount,
      note: amtOk === null ? '仅号码可校验' : '号码与金额一致',
    };
  } catch {
    return { state: 'unavailable', note: '无法解析二维码' };
  }
}
