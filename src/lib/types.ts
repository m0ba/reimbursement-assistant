export type InvoiceCategory = '住宿' | '火车' | '打车' | '其他';

export type VerifyState = 'ok' | 'mismatch' | 'unavailable' | 'unknown';

export interface InvoiceItem {
  id: string;
  fileName: string;
  blobKey: string;
  lastModified: number;
  status: 'pending' | 'parsing' | 'ok' | 'failed';
  number?: string;
  date?: string;
  seller?: string;
  buyer?: string;
  amount?: number;
  category?: InvoiceCategory;
  manualCategory?: boolean;
  verify?: VerifyState;
  verifyNote?: string;
  qrNumber?: string;
  qrAmount?: number;
  duplicate?: boolean;
  pages?: number;
  routeFrom?: string;
  routeTo?: string;
  trainNo?: string;
  departAt?: string;
}

export interface TrajItem {
  id: string;
  fileName: string;
  blobKey: string;
  w: number;
  h: number;
  status: 'pending' | 'parsing' | 'ok' | 'unknown' | 'skipped';
  date?: string;
  time?: string;
  manual?: boolean;
}

export type InvoiceMode = 'layout' | 'info' | 'verify';

export interface Batch {
  id: string;
  kind: 'invoice' | 'trajectory';
  createdAt: number;
  name: string;
  mode?: InvoiceMode;
  layoutFileId?: string;
  layoutDone?: boolean;
  layoutPages?: number;
  perPage?: 2 | 4;
  layoutKey?: string;
  done?: boolean;
  doneAt?: number;
  invoices?: InvoiceItem[];
  images?: TrajItem[];
}

export interface LibraryFile {
  id: string;
  name: string;
  blobKey: string;
  ext: 'pdf' | 'docx' | 'csv';
  createdAt: number;
  pages?: number;
  bytes?: number;
  batchId?: string;
}

export interface OcrModel {
  id: string;
  name: string;
  file: string;
  lang: string;
  mb: number;
  builtin?: boolean;
  source: string;
  note: string;
}

export interface Settings {
  ocrModelId: string;
  installedModels: string[];
  lastInvoiceMode: InvoiceMode;
  perPage: 2 | 4;
  introSeen: boolean;
}

export interface TaskState {
  kind: 'invoice' | 'trajectory' | 'merge' | null;
  step: string;
  label: string;
  done: number;
  total: number;
  running: boolean;
  paused: boolean;
  queued: number;
  cancelRequested: boolean;
  tone: 'idle' | 'run' | 'done' | 'warn';
  updatedAt: number;
}
