import { get, set, del, keys } from 'idb-keyval';

export async function putBlob(key: string, blob: Blob): Promise<void> {
  await set(key, blob);
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  return get<Blob>(key);
}

export async function deleteBlob(key: string): Promise<void> {
  await del(key);
}

export async function allBlobKeys(): Promise<string[]> {
  return (await keys()) as string[];
}

export async function blobUrl(key: string): Promise<string | null> {
  const blob = await getBlob(key);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function clearAllBlobs(): Promise<void> {
  const ks = await allBlobKeys();
  await Promise.all(ks.map((k) => del(k)));
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const cap = (globalThis as any).Capacitor;
  if (cap?.isNativePlatform?.()) {
    try {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
      const data = await blobToBase64(blob);
      const saved = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
      await Share.share({ title: filename, files: [saved.uri], dialogTitle: '保存或发送到…' });
      return;
    } catch {
      /* 落到浏览器下载 */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function fmtBytes(n?: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function stamp(d = new Date()): string {
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
