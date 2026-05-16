import type { Budget as BudgetDto, BudgetItem as BudgetItemDto } from '@kgk/schemas';
import { Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { type AuditContext, AuditService } from '../audit/audit.service';
import { toPublic as itemToPublic } from './budget-items.service';
import { toPublic as budgetToPublic } from './budgets.service';

/**
 * Budget の Excel エクスポート専任サービス。
 *
 * 設計方針:
 * - BudgetsService から関心を分離 (帳票生成は責務が独立)
 * - 数値は **Number 変換**: 想定金額 ~10^10 円 << Number.MAX_SAFE_INTEGER (9×10^15)
 *   なので精度安全。Excel 上で SUM 等の関数を使えるようにする
 * - 階層インデントは exceljs ネイティブの **alignment.indent** を使用。
 *   セル値に空白を入れない (VLOOKUP / コピー時にデータが壊れない)
 * - 列順: 行番号 / コード / 名称 / 仕様 / 単位 / 数量 / 単価 / 金額 / 備考
 */

interface ExportResult {
  buffer: Buffer;
  filename: string;
}

@Injectable()
export class BudgetExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async exportToExcel(
    projectId: string,
    budgetId: string,
    actorId: string,
    ctx: AuditContext,
  ): Promise<ExportResult> {
    // ヘッダ + 明細 + プロジェクト (code/name) を 1 回ずつ取得
    const budget = await this.prisma.budget.findFirst({
      where: { id: budgetId, projectId, deletedAt: null },
      include: { project: { select: { code: true, name: true } } },
    });
    if (!budget) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '予算が見つかりません' });
    }

    const items = await this.prisma.budgetItem.findMany({
      where: { budgetId, deletedAt: null },
      orderBy: [{ level: 'asc' }, { displayOrder: 'asc' }],
    });

    const budgetDto = budgetToPublic(budget);
    const itemDtos = items.map(itemToPublic);

    const buffer = await this.buildWorkbook(
      { code: budget.project.code, name: budget.project.name },
      budgetDto,
      itemDtos,
    );
    const filename = buildFilename(budgetDto);

    await this.audit.log({
      action: 'export',
      userId: actorId,
      entityType: 'budgets',
      entityId: budgetId,
      after: {
        format: 'xlsx',
        version: budgetDto.version,
        status: budgetDto.status,
        totalAmount: budgetDto.totalAmount,
        itemCount: itemDtos.length,
      },
      ...ctx,
    });

    return { buffer, filename };
  }

  // -----------------------------------------------------------------
  // Workbook builder (純粋関数寄り、テストしやすい)
  // -----------------------------------------------------------------
  private async buildWorkbook(
    project: { code: string; name: string },
    budget: BudgetDto,
    items: BudgetItemDto[],
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'kouji-genka';
    wb.created = new Date();

    const ws = wb.addWorksheet('内訳書', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 6 }], // ヘッダ部 + テーブルヘッダ行を固定
    });

    // 列幅 (行番号は narrow、名称・仕様は広め)
    ws.columns = [
      { key: 'no', width: 6 },
      { key: 'code', width: 10 },
      { key: 'name', width: 32 },
      { key: 'spec', width: 28 },
      { key: 'unit', width: 8 },
      { key: 'quantity', width: 12 },
      { key: 'unitPrice', width: 14 },
      { key: 'amount', width: 16 },
      { key: 'notes', width: 28 },
    ];

    // ----- ヘッダ部 (行 1-4) -----
    const headerStyle: Partial<ExcelJS.Style> = { font: { bold: true, size: 12 } };

    ws.getCell('A1').value = '実行予算 内訳書';
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.mergeCells('A1:I1');

    ws.getCell('A2').value = '工事';
    ws.getCell('A2').style = headerStyle;
    ws.getCell('B2').value = `${project.code}  ${project.name}`;
    ws.mergeCells('B2:I2');

    ws.getCell('A3').value = '予算';
    ws.getCell('A3').style = headerStyle;
    ws.getCell('B3').value =
      `v${budget.version}  ${budget.title ?? '(タイトル未設定)'}  /  status: ${budget.status}`;
    ws.mergeCells('B3:I3');

    ws.getCell('A4').value = '総合計';
    ws.getCell('A4').style = headerStyle;
    ws.getCell('B4').value = stringToNumber(budget.totalAmount);
    ws.getCell('B4').numFmt = '#,##0" 円"';
    ws.getCell('B4').font = { bold: true, size: 12 };
    ws.mergeCells('B4:I4');

    // 行 5 は意図的に空 (見やすさ)

    // ----- テーブルヘッダ (行 6) -----
    const headerRow = ws.getRow(6);
    headerRow.values = ['No', 'コード', '名称', '仕様', '単位', '数量', '単価', '金額', '備考'];
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' }, // 薄いグレー
    };
    headerRow.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
    };

    // ----- 明細 (行 7 以降) -----
    items.forEach((item, idx) => {
      const row = ws.addRow({
        no: idx + 1,
        code: item.code ?? '',
        name: item.name,
        spec: item.spec ?? '',
        unit: item.unit ?? '',
        quantity:
          item.quantity === '0' && item.kind !== 'detail' ? null : stringToNumber(item.quantity),
        unitPrice:
          item.unitPrice === '0' && item.kind !== 'detail' ? null : stringToNumber(item.unitPrice),
        amount: stringToNumber(item.amount),
        notes: item.notes ?? '',
      });

      // 名称セルに level に応じたインデント (空白プレフィックスは使わない)
      row.getCell('name').alignment = { indent: item.level * 2, vertical: 'middle' };

      // 数値書式
      row.getCell('quantity').numFmt = '#,##0.####';
      row.getCell('unitPrice').numFmt = '#,##0';
      row.getCell('amount').numFmt = '#,##0';

      // section / composite は装飾
      if (item.kind === 'section') {
        row.font = { bold: true };
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDBEAFE' }, // 薄青
        };
      } else if (item.kind === 'composite') {
        row.font = { bold: true };
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEDE9FE' }, // 薄紫
        };
      }
    });

    // ExcelJS の writeBuffer は ArrayBuffer-like を返す → Buffer に正規化
    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
  }
}

// =====================================================================
// helpers (export for testing)
// =====================================================================

/**
 * 文字列 → 数値変換。
 * 想定額 (~10^10 円) では Number.MAX_SAFE_INTEGER を遥かに下回るため安全。
 * "120.5" → 120.5、"1000000" → 1000000
 */
export function stringToNumber(s: string): number {
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return n;
}

/**
 * ダウンロード filename を組み立て。
 * 「予算内訳書_{title}_v{version}.xlsx」
 * title 未設定なら "予算内訳書_v{version}.xlsx"
 * ファイル名に使えない文字 (/ \ : * ? " < > | および制御文字) はアンダースコアに置換
 */
export function buildFilename(budget: { title: string | null; version: number }): string {
  const safe = (budget.title ?? '')
    .replace(/[/\\:*?"<>|]/g, '_')
    // 制御文字 (codepoint < 0x20) を除去。Biome の regex ルールを回避し、charCode で判定。
    .split('')
    .map((c) => (c.charCodeAt(0) < 0x20 ? '_' : c))
    .join('')
    .trim();
  const titlePart = safe ? `_${safe}` : '';
  return `予算内訳書${titlePart}_v${budget.version}.xlsx`;
}
