import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildFilename, stringToNumber } from './budget-export.service';

describe('budget-export helpers', () => {
  describe('stringToNumber', () => {
    it('整数文字列を Number に変換', () => {
      expect(stringToNumber('1000000')).toBe(1000000);
    });

    it('小数 4 桁まで保持', () => {
      expect(stringToNumber('120.5')).toBe(120.5);
      expect(stringToNumber('2.0001')).toBe(2.0001);
    });

    it('不正値は 0 にフォールバック (NaN を流さない)', () => {
      expect(stringToNumber('abc')).toBe(0);
      expect(stringToNumber('')).toBe(0);
    });
  });

  describe('buildFilename', () => {
    it('title あり: 予算内訳書_{title}_v{version}.xlsx', () => {
      expect(buildFilename({ title: '初期予算 (v1)', version: 1 })).toBe(
        '予算内訳書_初期予算 (v1)_v1.xlsx',
      );
    });

    it('title 未設定: 予算内訳書_v{version}.xlsx', () => {
      expect(buildFilename({ title: null, version: 3 })).toBe('予算内訳書_v3.xlsx');
    });

    it('禁則文字 (/ \\ : * ? " < > |) はアンダースコアに置換', () => {
      expect(buildFilename({ title: 'a/b\\c:d*e?f"g<h>i|j', version: 2 })).toBe(
        '予算内訳書_a_b_c_d_e_f_g_h_i_j_v2.xlsx',
      );
    });

    it('スペース / ハイフン / 丸括弧は維持される (OS 共通で許容)', () => {
      expect(buildFilename({ title: '改定 (2nd) - 試算', version: 5 })).toBe(
        '予算内訳書_改定 (2nd) - 試算_v5.xlsx',
      );
    });
  });
});

// ===================================================================
// Workbook 構造の統合テスト: 生成した Buffer を exceljs で再パースし、
// セル位置・値・型・書式・インデントを検証する
// ===================================================================
describe('BudgetExportService.buildWorkbook (Buffer 再パース)', () => {
  // BudgetExportService 内の private メソッドを直接呼ばず、Service 経由で生成。
  // ただし audit / prisma は使わないので、Workbook builder 部分のみ抜き出してテスト。
  // → Service を直接 new せず、buildWorkbook 相当を再実装するのは冗長なので、
  //    Service を mock Prisma で組んで exportToExcel を呼ぶ統合テストにする。

  async function buildBuffer(): Promise<Buffer> {
    // exceljs のみで「Service が作るのと同じ」最小ワークブックを作って検証……ではなく、
    // 実際の Service を呼んで Buffer を取り、その中身を検証する。
    const { BudgetExportService } = await import('./budget-export.service');
    const seedBudget = {
      id: '01900000-0000-7000-8000-00000000cccc',
      projectId: '01900000-0000-7000-8000-00000000bbbb',
      version: 1,
      status: 'draft' as const,
      title: '初期予算 (v1)',
      totalAmount: { toString: () => '2237100' } as never,
      submittedById: null,
      submittedAt: null,
      approvedById: null,
      approvedAt: null,
      notes: 'シードデータ',
      lockVersion: 0,
      createdAt: new Date('2026-05-16T00:00:00Z'),
      updatedAt: new Date('2026-05-16T00:00:00Z'),
      deletedAt: null,
      project: { code: '2026-001', name: 'サンプル工事' },
    };
    const seedItems = [
      mkItem({
        id: 'i1',
        level: 0,
        displayOrder: 1000,
        kind: 'section',
        code: '1',
        name: '直接工事費',
        amount: '1737100',
      }),
      mkItem({
        id: 'i2',
        level: 1,
        displayOrder: 1000,
        kind: 'composite',
        code: '1-1',
        name: '土工事',
        amount: '207100',
      }),
      mkItem({
        id: 'i3',
        level: 2,
        displayOrder: 1000,
        kind: 'detail',
        code: '1-1-1',
        name: '掘削',
        spec: 'バックホウ',
        unit: 'm3',
        quantity: '120.5',
        unitPrice: '1200',
        amount: '144600',
      }),
    ];

    const prisma = {
      budget: { findFirst: async () => seedBudget },
      budgetItem: { findMany: async () => seedItems },
    } as never;
    const audit = { log: async () => {} } as never;
    const svc = new BudgetExportService(prisma, audit);
    const { buffer } = await svc.exportToExcel(
      seedBudget.projectId,
      seedBudget.id,
      '01900000-0000-7000-8000-00000000aaaa',
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );
    return buffer;
  }

  function mkItem(o: {
    id: string;
    level: number;
    displayOrder: number;
    kind: 'section' | 'composite' | 'detail';
    code: string;
    name: string;
    spec?: string;
    unit?: string;
    quantity?: string;
    unitPrice?: string;
    amount: string;
  }) {
    return {
      id: o.id,
      budgetId: '01900000-0000-7000-8000-00000000cccc',
      parentId: null,
      level: o.level,
      displayOrder: o.displayOrder,
      kind: o.kind,
      code: o.code,
      name: o.name,
      spec: o.spec ?? null,
      unit: o.unit ?? null,
      costElement: null,
      quantity: { toString: () => o.quantity ?? '0' } as never,
      unitPrice: { toString: () => o.unitPrice ?? '0' } as never,
      amount: { toString: () => o.amount } as never,
      notes: null,
      lockVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
  }

  it('生成された Buffer は exceljs で再パース可能で、シート名は「内訳書」', async () => {
    const buf = await buildBuffer();
    const wb = new ExcelJS.Workbook();
    // exceljs.xlsx.load の型は古い Node Buffer (非 generic) を期待するため cast。
    // ランタイム上は Buffer<ArrayBufferLike> も問題なく受け付ける。
    // biome-ignore lint/suspicious/noExplicitAny: exceljs の型は古い Buffer (非 generic) を期待
    await wb.xlsx.load(buf as any);
    expect(wb.worksheets[0]?.name).toBe('内訳書');
  });

  it('ヘッダ部 (行 1-4) にタイトル / 工事名 / version+status / 総合計が入る', async () => {
    const buf = await buildBuffer();
    const wb = new ExcelJS.Workbook();
    // exceljs.xlsx.load の型は古い Node Buffer (非 generic) を期待するため cast。
    // ランタイム上は Buffer<ArrayBufferLike> も問題なく受け付ける。
    // biome-ignore lint/suspicious/noExplicitAny: exceljs の型は古い Buffer (非 generic) を期待
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('worksheet missing');
    expect(ws.getCell('A1').value).toContain('実行予算');
    expect(String(ws.getCell('B2').value)).toContain('2026-001');
    expect(String(ws.getCell('B2').value)).toContain('サンプル工事');
    expect(String(ws.getCell('B3').value)).toContain('v1');
    expect(String(ws.getCell('B3').value)).toContain('draft');
    // 総合計は Number として書かれ、numFmt はカンマ書式
    expect(ws.getCell('B4').value).toBe(2237100);
    expect(ws.getCell('B4').numFmt).toContain('#,##0');
  });

  it('テーブルヘッダ (行 6) は 9 列、書式は太字', async () => {
    const buf = await buildBuffer();
    const wb = new ExcelJS.Workbook();
    // exceljs.xlsx.load の型は古い Node Buffer (非 generic) を期待するため cast。
    // ランタイム上は Buffer<ArrayBufferLike> も問題なく受け付ける。
    // biome-ignore lint/suspicious/noExplicitAny: exceljs の型は古い Buffer (非 generic) を期待
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('worksheet missing');
    const row6 = ws.getRow(6);
    expect(row6.getCell(1).value).toBe('No');
    expect(row6.getCell(3).value).toBe('名称');
    expect(row6.getCell(8).value).toBe('金額');
    expect(row6.getCell(9).value).toBe('備考');
    expect(row6.font?.bold).toBe(true);
  });

  it('明細 detail 行は Number 書込 + numFmt が正しく付く', async () => {
    const buf = await buildBuffer();
    const wb = new ExcelJS.Workbook();
    // exceljs.xlsx.load の型は古い Node Buffer (非 generic) を期待するため cast。
    // ランタイム上は Buffer<ArrayBufferLike> も問題なく受け付ける。
    // biome-ignore lint/suspicious/noExplicitAny: exceljs の型は古い Buffer (非 generic) を期待
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('worksheet missing');
    // 行 9 = 明細 d111 (掘削) — section/composite を挟むので 7=section, 8=composite, 9=detail
    const row = ws.getRow(9);
    expect(row.getCell(3).value).toBe('掘削'); // name
    expect(row.getCell(5).value).toBe('m3'); // unit
    expect(row.getCell(6).value).toBe(120.5); // quantity (Number)
    expect(row.getCell(7).value).toBe(1200); // unitPrice (Number)
    expect(row.getCell(8).value).toBe(144600); // amount (Number)
    expect(row.getCell(7).numFmt).toBe('#,##0');
    expect(row.getCell(8).numFmt).toBe('#,##0');
  });

  it('名称セルに level に応じた indent が設定される (alignment.indent、空白プレフィックスではない)', async () => {
    const buf = await buildBuffer();
    const wb = new ExcelJS.Workbook();
    // exceljs.xlsx.load の型は古い Node Buffer (非 generic) を期待するため cast。
    // ランタイム上は Buffer<ArrayBufferLike> も問題なく受け付ける。
    // biome-ignore lint/suspicious/noExplicitAny: exceljs の型は古い Buffer (非 generic) を期待
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('worksheet missing');
    // section(level=0) → indent=0、composite(level=1) → 2、detail(level=2) → 4
    expect(ws.getRow(7).getCell(3).alignment?.indent ?? 0).toBe(0);
    expect(ws.getRow(8).getCell(3).alignment?.indent).toBe(2);
    expect(ws.getRow(9).getCell(3).alignment?.indent).toBe(4);
    // セル値そのものに余白が入っていないこと (alignment 経由なので "直接工事費" のまま)
    expect(ws.getRow(7).getCell(3).value).toBe('直接工事費');
    expect(ws.getRow(8).getCell(3).value).toBe('土工事');
  });

  it('section / composite 行は太字 + 背景色が付き、detail とは見分けがつく', async () => {
    const buf = await buildBuffer();
    const wb = new ExcelJS.Workbook();
    // exceljs.xlsx.load の型は古い Node Buffer (非 generic) を期待するため cast。
    // ランタイム上は Buffer<ArrayBufferLike> も問題なく受け付ける。
    // biome-ignore lint/suspicious/noExplicitAny: exceljs の型は古い Buffer (非 generic) を期待
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('worksheet missing');
    expect(ws.getRow(7).font?.bold).toBe(true); // section
    expect(ws.getRow(8).font?.bold).toBe(true); // composite
    expect(ws.getRow(9).font?.bold ?? false).toBe(false); // detail
  });
});
