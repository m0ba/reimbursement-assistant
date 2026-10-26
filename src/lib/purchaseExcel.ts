import ExcelJS from 'exceljs';
import { getBlob } from './db';
import type { PurchaseItem, PurchaseList } from './types';
import { escapeFormula, groupByCategory, itemTotal, listTotal, PRIORITY_LABEL, PURCHASE_CATEGORIES } from './purchase';

const HEADER_FILL = 'FF2F75B5';
const LIGHT_FILL = 'FFEAF2FA';
const BORDER = { style: 'thin' as const, color: { argb: 'FFB9C6D4' } };

function borderAll(cell: ExcelJS.Cell) {
  cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
}

function cellText(v: string) {
  return escapeFormula(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function applyTitle(ws: ExcelJS.Worksheet, list: PurchaseList) {
  ws.mergeCells('A1:K1');
  const t = ws.getCell('A1');
  t.value = list.name || '采购清单';
  t.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1D4E79' } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:K2');
  const totalCell = ws.getCell('A2');
  totalCell.value = { formula: `="参考总额：¥"&TEXT(H999,"#,##0.00")` };
  totalCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFC00000' } };
  totalCell.alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 6;
}

function headerRow(ws: ExcelJS.Worksheet, row: number) {
  const heads = ['序号', '分类', '名称', '规格', '单位', '数量', '单价（元）', '小计（元）', '优先级', '备注', '购买链接'];
  heads.forEach((h, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = h;
    c.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    borderAll(c);
  });
  ws.getRow(row).height = 30;
}

export async function buildPurchaseXlsx(list: PurchaseList): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '报销助手';
  wb.created = new Date();

  const ws = wb.addWorksheet('采购清单', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
      printTitlesRow: '4:4',
    },
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  ws.columns = [
    { width: 6.5 }, { width: 10 }, { width: 26 }, { width: 40 },
    { width: 7 }, { width: 8 }, { width: 12 }, { width: 12 },
    { width: 8 }, { width: 22 }, { width: 28 },
  ];

  applyTitle(ws, list);
  headerRow(ws, 4);

  let row = 5;
  let seq = 0;
  const totalRowIndex = { value: 0 };
  const categorySubtotalRows: number[] = [];

  const strokeText = (c: ExcelJS.Cell) => {
    c.font = { name: 'Arial', size: 10 };
    c.alignment = { vertical: 'middle', wrapText: true };
    borderAll(c);
  };

  for (const group of groupByCategory(list)) {
    // 分类标题行
    ws.mergeCells(row, 1, row, 11);
    const g = ws.getCell(row, 1);
    g.value = `${group.category} · ${group.items.length} 项`;
    g.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF1D4E79' } };
    g.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_FILL } };
    g.alignment = { vertical: 'middle' };
    for (let c = 1; c <= 11; c++) borderAll(ws.getCell(row, c));
    ws.getRow(row).height = 22;
    row += 1;

    const start = row;
    for (const item of group.items) {
      seq += 1;
      const vals = [
        seq,
        cellText(item.category),
        cellText(item.name),
        cellText(item.spec),
        cellText(item.unit),
        item.qty ?? '',
        item.price ?? '',
        null,
        PRIORITY_LABEL[item.priority],
        cellText(item.note),
      ];
      vals.forEach((v, i) => {
        const c = ws.getCell(row, i + 1);
        c.value = v as ExcelJS.CellValue;
        strokeText(c);
        if (i === 0 || i === 4 || i === 5 || i === 8) c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        if (i === 6) c.numFmt = '#,##0.00';
      });
      const total = ws.getCell(row, 8);
      total.value = { formula: `IF(OR(F${row}="",G${row}=""),"",F${row}*G${row})` };
      total.numFmt = '#,##0.00';
      strokeText(total);

      const link = ws.getCell(row, 11);
      if (item.link) {
        link.value = { text: item.link, hyperlink: item.link };
        link.font = { name: 'Arial', size: 9, color: { argb: 'FF0A84FF' }, underline: true };
      } else {
        link.value = '';
        link.font = { name: 'Arial', size: 9 };
      }
      link.alignment = { vertical: 'middle', wrapText: true };
      borderAll(link);

      const specLines = Math.max(1, Math.ceil((item.spec || '').length / 22));
      ws.getRow(row).height = Math.max(30, specLines * 14 + 12);
      row += 1;
    }

    // 分类小计
    ws.mergeCells(row, 1, row, 7);
    const label = ws.getCell(row, 1);
    label.value = `${group.category}小计`;
    label.font = { name: 'Arial', size: 10, bold: true };
    label.alignment = { horizontal: 'right', vertical: 'middle' };
    const sub = ws.getCell(row, 8);
    sub.value = { formula: `SUM(H${start}:H${row - 1})` };
    sub.numFmt = '#,##0.00';
    sub.font = { name: 'Arial', size: 10, bold: true };
    sub.alignment = { horizontal: 'right', vertical: 'middle' };
    for (let c = 1; c <= 11; c++) borderAll(ws.getCell(row, c));
    ws.getRow(row).height = 22;
    categorySubtotalRows.push(row);
    row += 1;
  }

  // 合计
  ws.mergeCells(row, 1, row, 7);
  const tl = ws.getCell(row, 1);
  tl.value = '合计';
  tl.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFC00000' } };
  tl.alignment = { horizontal: 'right', vertical: 'middle' };
  const tv = ws.getCell(row, 8);
  const sumExpr = categorySubtotalRows.length ? categorySubtotalRows.map((r) => `H${r}`).join('+') : '0';
  tv.value = { formula: sumExpr };
  tv.numFmt = '#,##0.00';
  tv.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFC00000' } };
  tv.alignment = { horizontal: 'right', vertical: 'middle' };
  for (let c = 1; c <= 11; c++) borderAll(ws.getCell(row, c));
  ws.getRow(row).height = 24;
  totalRowIndex.value = row;

  // 顶部总额引用真实合计行
  ws.getCell('A2').value = { formula: `="参考总额：¥"&TEXT(H${row},"#,##0.00")` };
  ws.pageSetup.printArea = `A1:K${row}`;

  // ---------- Sheet 2 ----------
  const detail = wb.addWorksheet('规格与图片', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
    },
  });
  detail.columns = [
    { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 10 },
    { width: 8 }, { width: 8 }, { width: 12 }, { width: 10 }, { width: 24 },
  ];

  let dr = 1;
  const title = detail.getCell(dr, 1);
  detail.mergeCells(dr, 1, dr, 10);
  title.value = `${list.name} · 规格与图片`;
  title.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FF1D4E79' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  detail.getRow(dr).height = 28;
  dr += 2;

  for (let idx = 0; idx < list.items.length; idx++) {
    const item = list.items[idx];
    detail.mergeCells(dr, 1, dr, 10);
    const hcell = detail.getCell(dr, 1);
    hcell.value = `${idx + 1}. ${cellText(item.name) || '未命名'}`;
    hcell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF1D4E79' } };
    hcell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_FILL } };
    hcell.alignment = { vertical: 'middle' };
    detail.getRow(dr).height = 22;
    dr += 1;

    const info = [
      `分类：${cellText(item.category)}`,
      `规格：${cellText(item.spec)}`,
      `数量：${item.qty ?? ''} ${cellText(item.unit)}    单价：${item.price ?? ''}    小计：${itemTotal(item) ?? ''}`,
      `优先级：${PRIORITY_LABEL[item.priority]}    链接：${cellText(item.link)}`,
      `备注：${cellText(item.note)}`,
    ];
    for (const line of info) {
      detail.mergeCells(dr, 4, dr, 10);
      const c = detail.getCell(dr, 4);
      c.value = escapeFormula(line);
      c.font = { name: 'Arial', size: 9.5 };
      c.alignment = { vertical: 'middle', wrapText: true };
      detail.getRow(dr).height = 18;
      dr += 1;
    }

    // 图片网格：左侧 3 列
    const imgs = item.images.slice(0, 6);
    const imgTop = dr - info.length;
    if (imgs.length) {
      const cols = 3;
      const cellW = 122;
      const cellH = 92;
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        const blob = await getBlob(img.blobKey);
        if (!blob) continue;
        const buf = new Uint8Array(await blob.arrayBuffer());
        let base64 = '';
        const chunk = 0x8000;
        for (let p = 0; p < buf.length; p += chunk) base64 += String.fromCharCode.apply(null, Array.from(buf.subarray(p, p + chunk)) as unknown as number[]);
        base64 = btoa(base64);
        const ext = blob.type.includes('png') ? 'png' : 'jpeg';
        const imageId = wb.addImage({ base64, extension: ext as 'png' | 'jpeg' });
        const c = i % cols;
        const r = Math.floor(i / cols);
        const targetCell = detail.getCell(imgTop + r * 2, c + 1);
        detail.getRow(imgTop + r * 2).height = Math.max(detail.getRow(imgTop + r * 2).height || 18, 20);
        detail.addImage(imageId, {
          tl: { col: c + 0.15, row: imgTop + r * 2 - 1 + 0.1 },
          ext: { width: cellW, height: cellH },
          editAs: 'oneCell',
        } as any);
        void targetCell;
      }
      const rowsNeeded = Math.ceil(imgs.length / 3) * 2;
      for (let k = 0; k < rowsNeeded; k++) {
        const r = imgTop + k;
        detail.getRow(r).height = Math.max(detail.getRow(r).height || 0, k % 2 === 0 ? 50 : 46);
      }
      dr = Math.max(dr, imgTop + rowsNeeded);
    }
    dr += 1;
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
