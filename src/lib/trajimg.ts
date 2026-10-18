export type NormImage = { data: Uint8Array; w: number; h: number; type: 'jpg' | 'png' };

/** 参考排版的单张比例：900×1634 的手机截图。 */
const TARGET_ASPECT = 0.55;
/** 已经接近目标比例就不动，避免二次压缩。 */
const KEEP_ASPECT = 0.53;
/** 最多裁掉高度的 22%，防止识别到奇怪比例时把地图裁没。 */
const MAX_TRIM = 0.22;
const MAX_WIDTH = 1000;

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('img'));
    };
    img.src = url;
  });
}

/**
 * 读取截图；trim 时只裁手机状态栏和底部按钮条，保留中间的行驶轨迹。
 * 顶部裁掉的多余高度的 29%，其余从底部裁，裁完的空高刚好接近参考图比例。
 */
export async function normalizeTrajImage(blob: Blob, trim: boolean): Promise<NormImage> {
  const img = await loadImage(blob);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const aspect = w / h;
  const type: 'jpg' | 'png' = blob.type.includes('png') ? 'png' : 'jpg';

  if (!trim || aspect >= KEEP_ASPECT) {
    return { data: new Uint8Array(await blob.arrayBuffer()), w, h, type };
  }

  let remove = h - w / TARGET_ASPECT;
  remove = Math.min(remove, Math.round(h * MAX_TRIM));
  const top = Math.round(remove * 0.29);
  const keepH = h - remove;

  const outW = Math.min(w, MAX_WIDTH);
  const scale = outW / w;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = Math.round(keepH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { data: new Uint8Array(await blob.arrayBuffer()), w, h, type };
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, top, w, keepH, 0, 0, canvas.width, canvas.height);

  const out = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.85));
  if (!out) return { data: new Uint8Array(await blob.arrayBuffer()), w, h, type };
  return { data: new Uint8Array(await out.arrayBuffer()), w: canvas.width, h: canvas.height, type: 'jpg' };
}
