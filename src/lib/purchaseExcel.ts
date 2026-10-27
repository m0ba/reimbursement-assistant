import ExcelJS from 'exceljs';
import { getBlob } from './db';
import type { PurchaseItem, PurchaseList } from './types';
import { escapeFormula, groupByCategory, itemTotal, PRIORITY_LABEL } from './purchase';

const SHEET_LIST = '采购清单';
const SHEET_IMAGES = '规格与图片';
const LIST_COLS = 11;
const DETAIL_COLS = 8;

const NAVY = 'FF17365D';
const HEADER_BLUE = 'FF2F75B5';
const SUMMARY_BLUE = 'FFEAF2FA';
const SECTION_BLUE = 'FFDDEBF7';
const SOFT_BLUE = 'FFF7FAFD';
const WHITE = 'FFFFFFFF';
const TEXT = 'FF1F2937';
const MUTED = 'FF6B7280';
const LINK_BLUE = 'FF0A6ED1';
const BORDER_COLOR = 'FFB9C6D4';
const BORDER = { style: 'thin' as const, color: { argb: BORDER_COLOR } };
const STRONG_BORDER = { style: 'medium' as const, color: { argb: 'FF8FA8C2' } };
const CN_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function cellText(value: string) {
  return escapeFormula(String(value ?? '')).replace(CONTROL, '');
}

function fillCell(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function fillRow(ws: ExcelJS.Worksheet, row: number, cols: number, argb: string) {
  for (let col = 1; col <= cols; col += 1) fillCell(ws.getCell(row, col), argb);
}

function borderAll(cell: ExcelJS.Cell) {
  cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
}

function styleInternalLink(cell: ExcelJS.Cell, text: string, target: string) {
  cell.value = { text, hyperlink: `#${target}` };
  cell.font = { name: 'Arial', size: 10, color: { argb: LINK_BLUE }, underline: true };
}

function styleExternalLink(cell: ExcelJS.Cell, text: string, url: string) {
  cell.value = { text, hyperlink: url };
  cell.font = { name: 'Arial', size: 10, color: { argb: LINK_BLUE }, underline: true };
}

function channelLabel(link: string) {
  if (!link) return '—';
  const lower = link.toLowerCase();
  if (lower.includes('tmall.com')) return '天猫';
  if (lower.includes('taobao.com')) return '淘宝';
  if (lower.includes('jd.com')) return '京东';
  if (lower.includes('yangkeduo.com') || lower.includes('pinduoduo.com')) return '拼多多';
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return '外部链接';
  }
}

function dateLabel() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function groupLabel(index: number, name: string, count: number) {
  const prefix = CN_NUMBERS[index] || String(index + 1);
  return `${prefix}、${cellText(name)}（${count} 项）`;
}

async function blobBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(binary);
}

async function imageSize(blob: Blob, maxWidth: number, maxHeight: number) {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height);
    const size = {
      width: Math.max(1, Math.round(bitmap.width * scale)),
      height: Math.max(1, Math.round(bitmap.height * scale)),
    };
    bitmap.close?.();
    return size;
  } catch {
    return { width: maxWidth, height: Math.round(maxHeight * 0.66) };
  }
}

function writeListTitle(ws: ExcelJS.Worksheet, list: PurchaseList) {
  fillRow(ws, 1, LIST_COLS, NAVY);
  ws.mergeCells(1, 1, 1, LIST_COLS);
  const title = ws.getCell(1, 1);
  title.value = cellText(list.name) || '采购清单';
  title.font = { name: 'Arial', size: 16, bold: true, color: { argb: WHITE } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  fillRow(ws, 2, LIST_COLS, SUMMARY_BLUE);
  ws.mergeCells(2, 1, 2, 3);
  ws.mergeCells(2, 4, 2, 7);
  ws.mergeCells(2, 8, 2, LIST_COLS);
  ws.getCell(2, 1).value = `采购项目：${list.items.length} 项`;
  ws.getCell(2, 4).value = '参考总额：¥0.00';
  ws.getCell(2, 8).value = `报价日期：${dateLabel()}`;
  for (const col of [1, 4, 8]) {
    const cell = ws.getCell(2, col);
    cell.font = { name: 'Arial', size: 10.5, bold: col === 4, color: { argb: col === 4 ? 'FFC00000' : TEXT } };
    cell.alignment = { horizontal: col === 8 ? 'right' : col === 1 ? 'left' : 'center', vertical: 'middle' };
  }
  ws.getRow(2).height = 24;
  ws.getRow(3).height = 7;
}

function writeListHeader(ws: ExcelJS.Worksheet) {
  const heads = ['序号', '名称', '规格', '单位', '数量', '单价（元）', '小计（元）', '采购渠道', '优先级', '购买链接', '备注'];
  heads.forEach((head, index) => {
    const cell = ws.getCell(4, index + 1);
    cell.value = head;
    fillCell(cell, HEADER_BLUE);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    borderAll(cell);
  });
  ws.getRow(4).height = 30;
}

interface DetailItemPlan {
  item: PurchaseItem;
  cardRow: number;
  imageRow: number;
  infoOneRow: number;
  infoTwoRow: number;
  sequence: number;
}

interface DetailGroupPlan {
  category: string;
  categoryRow: number;
  items: DetailItemPlan[];
}

export async function buildPurchaseXlsx(list: PurchaseList): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '报销助手';
  workbook.created = new Date();

  const listSheet = workbook.addWorksheet(SHEET_LIST, {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
      printTitlesRow: '1:4',
      horizontalCentered: true,
    },
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  });
  listSheet.columns = [
    { width: 7 }, { width: 24 }, { width: 38 }, { width: 8 }, { width: 8 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 8 }, { width: 13 }, { width: 26 },
  ];

  const detailSheet = workbook.addWorksheet(SHEET_IMAGES, {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
      printTitlesRow: '1:2',
      horizontalCentered: true,
    },
    views: [{ showGridLines: false }],
  });
  detailSheet.columns = [
    { width: 20 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 12 },
    { width: 12 }, { width: 13 }, { width: 24 },
  ];

  const groups = groupByCategory(list);
  const detailPlan: DetailGroupPlan[] = [];
  const detailRows = new Map<string, number>();
  let plannedRow = 4;
  let sequence = 0;
  for (const group of groups) {
    const categoryRow = plannedRow;
    plannedRow += 1;
    const groupPlan: DetailGroupPlan = { category: group.category, categoryRow, items: [] };
    for (const item of group.items) {
      sequence += 1;
      const cardRow = plannedRow;
      const imageRow = cardRow + 1;
      const infoOneRow = imageRow + 4;
      const infoTwoRow = infoOneRow + 1;
      groupPlan.items.push({ item, cardRow, imageRow, infoOneRow, infoTwoRow, sequence });
      detailRows.set(item.id, cardRow);
      plannedRow = infoTwoRow + 2;
    }
    detailPlan.push(groupPlan);
  }

  writeListTitle(listSheet, list);
  writeListHeader(listSheet);

  let listRow = 5;
  let itemSequence = 0;
  const itemListRows: number[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    fillRow(listSheet, listRow, LIST_COLS, SECTION_BLUE);
    listSheet.mergeCells(listRow, 1, listRow, LIST_COLS);
    const groupCell = listSheet.getCell(listRow, 1);
    groupCell.value = groupLabel(groupIndex, group.category, group.items.length);
    groupCell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: NAVY } };
    groupCell.alignment = { horizontal: 'left', vertical: 'middle' };
    listSheet.getRow(listRow).height = 23;
    listRow += 1;

    for (const item of group.items) {
      itemSequence += 1;
      const detailRow = detailRows.get(item.id) || 1;
      const rowValues: ExcelJS.CellValue[] = [
        itemSequence,
        cellText(item.name) || '未命名',
        cellText(item.spec),
        cellText(item.unit),
        item.qty ?? '',
        item.price ?? '',
        null,
        channelLabel(item.link),
        PRIORITY_LABEL[item.priority],
        item.link ? '点击购买' : '—',
        cellText(item.note),
      ];
      rowValues.forEach((value, index) => {
        const cell = listSheet.getCell(listRow, index + 1);
        cell.value = value;
        cell.font = { name: 'Arial', size: 10, color: { argb: TEXT } };
        cell.alignment = {
          horizontal: [6, 7].includes(index + 1)
            ? 'right'
            : [1, 4, 5, 8, 9, 10].includes(index + 1)
              ? 'center'
              : 'left',
          vertical: 'middle',
          wrapText: true,
        };
        borderAll(cell);
      });

      styleInternalLink(listSheet.getCell(listRow, 2), cellText(item.name) || '未命名', `'${SHEET_IMAGES}'!A${detailRow}`);
      if (item.spec) {
        styleInternalLink(listSheet.getCell(listRow, 3), cellText(item.spec), `'${SHEET_IMAGES}'!A${detailRow}`);
      }

      const priceCell = listSheet.getCell(listRow, 6);
      priceCell.numFmt = '"¥"#,##0.00';
      const totalCell = listSheet.getCell(listRow, 7);
      totalCell.value = { formula: `IF(OR(E${listRow}="",F${listRow}=""),"",E${listRow}*F${listRow})` };
      totalCell.numFmt = '"¥"#,##0.00';

      const linkCell = listSheet.getCell(listRow, 10);
      if (item.link) styleExternalLink(linkCell, '点击购买', item.link);

      const specLines = Math.max(1, Math.ceil(cellText(item.spec).length / 25));
      const noteLines = Math.max(1, Math.ceil(cellText(item.note).length / 18));
      listSheet.getRow(listRow).height = Math.max(34, Math.max(specLines, noteLines) * 14 + 14);
      itemListRows.push(listRow);
      listRow += 1;
    }
  }

  const totalRow = listRow;
  fillRow(listSheet, totalRow, LIST_COLS, NAVY);
  listSheet.mergeCells(totalRow, 1, totalRow, 6);
  listSheet.mergeCells(totalRow, 8, totalRow, LIST_COLS);
  const totalLabel = listSheet.getCell(totalRow, 1);
  totalLabel.value = '参考报价合计';
  totalLabel.font = { name: 'Arial', size: 11, bold: true, color: { argb: WHITE } };
  totalLabel.alignment = { horizontal: 'right', vertical: 'middle' };
  const totalValue = listSheet.getCell(totalRow, 7);
  totalValue.value = { formula: itemListRows.length ? `SUM(G${itemListRows[0]}:G${itemListRows[itemListRows.length - 1]})` : '0' };
  totalValue.numFmt = '"¥"#,##0.00';
  totalValue.font = { name: 'Arial', size: 11, bold: true, color: { argb: WHITE } };
  totalValue.alignment = { horizontal: 'right', vertical: 'middle' };
  const totalNote = listSheet.getCell(totalRow, 8);
  totalNote.value = `人民币元｜共 ${list.items.length} 项商品 / 服务`;
  totalNote.font = { name: 'Arial', size: 9.5, color: { argb: WHITE } };
  totalNote.alignment = { horizontal: 'right', vertical: 'middle' };
  listSheet.getRow(totalRow).height = 25;

  listSheet.getCell(2, 4).value = { formula: `="参考总额：¥"&TEXT(G${totalRow},"#,##0.00")` };
  listSheet.pageSetup.printArea = `A1:K${totalRow}`;

  fillRow(detailSheet, 1, DETAIL_COLS, NAVY);
  detailSheet.mergeCells(1, 1, 1, DETAIL_COLS);
  const detailTitle = detailSheet.getCell(1, 1);
  detailTitle.value = `${cellText(list.name) || '采购清单'} · 商品规格与图片`;
  detailTitle.font = { name: 'Arial', size: 15, bold: true, color: { argb: WHITE } };
  detailTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  detailSheet.getRow(1).height = 30;

  fillRow(detailSheet, 2, DETAIL_COLS, SUMMARY_BLUE);
  detailSheet.mergeCells(2, 1, 2, 5);
  detailSheet.mergeCells(2, 6, 2, DETAIL_COLS);
  detailSheet.getCell(2, 1).value = `共 ${list.items.length} 项商品 / 服务，图片用于采购核验`;
  detailSheet.getCell(2, 1).font = { name: 'Arial', size: 10, color: { argb: TEXT } };
  detailSheet.getCell(2, 1).alignment = { vertical: 'middle' };
  styleInternalLink(detailSheet.getCell(2, 6), '返回采购清单', `'${SHEET_LIST}'!A1`);
  detailSheet.getCell(2, 6).alignment = { horizontal: 'right', vertical: 'middle' };
  detailSheet.getRow(2).height = 22;
  detailSheet.getRow(3).height = 7;

  for (let groupIndex = 0; groupIndex < detailPlan.length; groupIndex += 1) {
    const group = detailPlan[groupIndex];
    fillRow(detailSheet, group.categoryRow, DETAIL_COLS, HEADER_BLUE);
    detailSheet.mergeCells(group.categoryRow, 1, group.categoryRow, DETAIL_COLS);
    const categoryCell = detailSheet.getCell(group.categoryRow, 1);
    categoryCell.value = groupLabel(groupIndex, group.category, group.items.length);
    categoryCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: WHITE } };
    categoryCell.alignment = { horizontal: 'left', vertical: 'middle' };
    detailSheet.getRow(group.categoryRow).height = 23;

    for (const plan of group.items) {
      const item = plan.item;
      fillRow(detailSheet, plan.cardRow, DETAIL_COLS, SOFT_BLUE);
      detailSheet.mergeCells(plan.cardRow, 1, plan.cardRow, 6);
      detailSheet.mergeCells(plan.cardRow, 7, plan.cardRow, DETAIL_COLS);
      const itemTitle = detailSheet.getCell(plan.cardRow, 1);
      itemTitle.value = `${String(plan.sequence).padStart(2, '0')}｜${cellText(item.name) || '未命名'}`;
      itemTitle.font = { name: 'Arial', size: 11, bold: true, color: { argb: NAVY } };
      itemTitle.alignment = { vertical: 'middle', wrapText: true };
      const itemMeta = detailSheet.getCell(plan.cardRow, 7);
      const price = item.price === null ? '未填单价' : `¥${item.price.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      itemMeta.value = `优先级：${PRIORITY_LABEL[item.priority]}｜${price}`;
      itemMeta.font = { name: 'Arial', size: 9.5, color: { argb: MUTED } };
      itemMeta.alignment = { horizontal: 'right', vertical: 'middle' };
      detailSheet.getRow(plan.cardRow).height = 26;

      for (let imageRow = plan.imageRow; imageRow < plan.imageRow + 4; imageRow += 1) {
        fillRow(detailSheet, imageRow, DETAIL_COLS, WHITE);
        detailSheet.getRow(imageRow).height = 72;
      }
      detailSheet.mergeCells(plan.imageRow, 1, plan.imageRow + 3, DETAIL_COLS);
      const imageCell = detailSheet.getCell(plan.imageRow, 1);
      imageCell.alignment = { horizontal: 'center', vertical: 'middle' };
      const primaryImage = item.images[0];
      const imageBlob = primaryImage ? await getBlob(primaryImage.blobKey) : null;
      if (imageBlob) {
        const base64 = await blobBase64(imageBlob);
        const extension = imageBlob.type.includes('png') ? 'png' : 'jpeg';
        const imageId = workbook.addImage({ base64, extension });
        const size = await imageSize(imageBlob, 900, 380);
        detailSheet.addImage(imageId, {
          tl: { col: 0.12, row: plan.imageRow - 1 + 0.08 },
          ext: size,
          editAs: 'oneCell',
        } as any);
        imageCell.value = '';
      } else {
        imageCell.value = '暂无商品图片';
        imageCell.font = { name: 'Arial', size: 10, color: { argb: MUTED } };
      }

      fillRow(detailSheet, plan.infoOneRow, DETAIL_COLS, WHITE);
      detailSheet.mergeCells(plan.infoOneRow, 1, plan.infoOneRow, 3);
      detailSheet.mergeCells(plan.infoOneRow, 4, plan.infoOneRow, 5);
      detailSheet.mergeCells(plan.infoOneRow, 6, plan.infoOneRow, DETAIL_COLS);
      const specInfo = detailSheet.getCell(plan.infoOneRow, 1);
      specInfo.value = `规格：${cellText(item.spec) || '—'}`;
      const quantityInfo = detailSheet.getCell(plan.infoOneRow, 4);
      quantityInfo.value = `数量：${item.qty ?? '—'} ${cellText(item.unit)}`;
      const noteInfo = detailSheet.getCell(plan.infoOneRow, 6);
      noteInfo.value = `备注：${cellText(item.note) || '—'}`;
      for (const col of [1, 4, 6]) {
        const cell = detailSheet.getCell(plan.infoOneRow, col);
        cell.font = { name: 'Arial', size: 10, color: { argb: TEXT } };
        cell.alignment = { vertical: 'middle', wrapText: true };
        borderAll(cell);
      }
      detailSheet.getRow(plan.infoOneRow).height = 32;

      fillRow(detailSheet, plan.infoTwoRow, DETAIL_COLS, SOFT_BLUE);
      detailSheet.mergeCells(plan.infoTwoRow, 1, plan.infoTwoRow, 2);
      detailSheet.mergeCells(plan.infoTwoRow, 3, plan.infoTwoRow, DETAIL_COLS);
      const linkLabel = detailSheet.getCell(plan.infoTwoRow, 1);
      linkLabel.value = '购买链接';
      linkLabel.font = { name: 'Arial', size: 10, color: { argb: MUTED } };
      linkLabel.alignment = { horizontal: 'center', vertical: 'middle' };
      borderAll(linkLabel);
      const linkCell = detailSheet.getCell(plan.infoTwoRow, 3);
      if (item.link) {
        styleExternalLink(linkCell, '打开商品链接', item.link);
      } else {
        linkCell.value = '未填写';
        linkCell.font = { name: 'Arial', size: 10, color: { argb: MUTED } };
      }
      linkCell.alignment = { horizontal: 'left', vertical: 'middle' };
      borderAll(linkCell);
      detailSheet.getRow(plan.infoTwoRow).height = 29;

      // Card outline stays outside the content so the photo itself has no grid lines through it.
      for (let row = plan.cardRow; row <= plan.infoTwoRow; row += 1) {
        for (let col = 1; col <= DETAIL_COLS; col += 1) {
          const cell = detailSheet.getCell(row, col);
          cell.border = {
            ...cell.border,
            top: row === plan.cardRow ? STRONG_BORDER : cell.border?.top,
            bottom: row === plan.infoTwoRow ? STRONG_BORDER : cell.border?.bottom,
            left: col === 1 ? STRONG_BORDER : cell.border?.left,
            right: col === DETAIL_COLS ? STRONG_BORDER : cell.border?.right,
          };
        }
      }
    }
  }

  const detailLastRow = Math.max(3, plannedRow - 2);
  detailSheet.pageSetup.printArea = `A1:H${detailLastRow}`;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
