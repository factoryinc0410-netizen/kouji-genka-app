'use client';

import type { BudgetItem } from '@kgk/schemas';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  type Row,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { updateBudgetItem } from '@/lib/api/budgets';
import { ApiError } from '@/lib/api/client';
import { type BudgetItemNode, buildBudgetTree } from '@/lib/budget-tree';
import { formatAmount } from '@/lib/format';

const KIND_LABEL: Record<BudgetItem['kind'], string> = {
  section: '科目',
  composite: '代価',
  detail: '明細',
};

const COST_ELEMENT_LABEL: Record<NonNullable<BudgetItem['costElement']>, string> = {
  labor: '労務',
  material: '材料',
  subcontract: '外注',
  machine: '機械',
  expense: '経費',
};

interface Props {
  projectId: string;
  budgetId: string;
  items: BudgetItem[];
  /** リロードを促す callback (楽観ロック衝突時 + 編集成功時) */
  onRefresh: () => void;
  /** 編集成功時に呼ばれる。最新 item でローカル state を上書きする用 */
  onItemUpdated: (updated: BudgetItem) => void;
  /** 編集可否 (将来 ABAC で edit 不可なら false にして read-only にする) */
  editable?: boolean;
}

export function BudgetTreeTable({
  projectId,
  budgetId,
  items,
  onRefresh,
  onItemUpdated,
  editable = true,
}: Props): React.ReactElement {
  const tree = useMemo(() => buildBudgetTree(items), [items]);

  const toast = useToast();

  /**
   * 葉 (detail) を更新する共通ハンドラ。
   * - 入力は string のまま PATCH (number キャスト禁止: 精度ロス対策)
   * - 409 BUDGET_ITEM_VERSION_MISMATCH → toast で「他者が更新しました」+ リロードアクション
   */
  const handleEditDetail = useCallback(
    async (
      item: BudgetItem,
      body: { lockVersion: number; quantity?: string; unitPrice?: string },
    ): Promise<void> => {
      try {
        const res = await updateBudgetItem(projectId, budgetId, item.id, body);
        onItemUpdated(res.item);
        // 親方向の amount/totalAmount はサーバで再計算済 → 再フェッチで反映
        onRefresh();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'BUDGET_ITEM_VERSION_MISMATCH') {
          toast.show({
            kind: 'warning',
            title: '他のユーザによって更新されました',
            description: '最新の値をリロードしてから再度編集してください。',
            actionLabel: '最新を取得',
            onAction: onRefresh,
          });
          return;
        }
        toast.show({
          kind: 'error',
          title: '更新に失敗しました',
          description: err instanceof ApiError ? err.message : '不明なエラー',
        });
      }
    },
    [projectId, budgetId, onItemUpdated, onRefresh, toast],
  );

  const columns = useMemo<ColumnDef<BudgetItemNode>[]>(
    () => [
      {
        id: 'code',
        header: 'コード',
        cell: ({ row }) => (
          <div className="flex items-center" style={{ paddingLeft: `${row.depth * 16}px` }}>
            {row.getCanExpand() ? (
              <button
                type="button"
                onClick={row.getToggleExpandedHandler()}
                aria-label={row.getIsExpanded() ? '折りたたむ' : '展開'}
                className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
              >
                {row.getIsExpanded() ? '▾' : '▸'}
              </button>
            ) : (
              <span className="mr-1 inline-block w-5" />
            )}
            <span className="font-mono text-xs">{row.original.code ?? '—'}</span>
          </div>
        ),
        size: 140,
      },
      {
        id: 'name',
        header: '摘要',
        cell: ({ row }) => (
          <div>
            <div>{row.original.name}</div>
            {row.original.spec ? (
              <div className="text-xs text-muted-foreground">{row.original.spec}</div>
            ) : null}
          </div>
        ),
        size: 280,
      },
      {
        id: 'kind',
        header: '種別',
        cell: ({ row }) => (
          <span
            className={
              row.original.kind === 'section'
                ? 'text-xs font-medium text-blue-700 dark:text-blue-300'
                : row.original.kind === 'composite'
                  ? 'text-xs font-medium text-violet-700 dark:text-violet-300'
                  : 'text-xs text-muted-foreground'
            }
          >
            {KIND_LABEL[row.original.kind]}
          </span>
        ),
        size: 60,
      },
      {
        id: 'costElement',
        header: '原価',
        cell: ({ row }) =>
          row.original.costElement ? (
            <span className="text-xs">{COST_ELEMENT_LABEL[row.original.costElement]}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        size: 60,
      },
      {
        id: 'unit',
        header: '単位',
        cell: ({ row }) => <span className="text-xs">{row.original.unit ?? '—'}</span>,
        size: 60,
      },
      {
        id: 'quantity',
        header: () => <div className="text-right">数量</div>,
        cell: ({ row }) =>
          editable && row.original.kind === 'detail' ? (
            <DecimalCell
              value={row.original.quantity}
              pattern={/^\d+(\.\d{1,4})?$/}
              onCommit={(next) =>
                handleEditDetail(row.original, {
                  lockVersion: row.original.lockVersion,
                  quantity: next,
                })
              }
            />
          ) : (
            <div className="text-right tabular-nums">{row.original.quantity}</div>
          ),
        size: 120,
      },
      {
        id: 'unitPrice',
        header: () => <div className="text-right">単価</div>,
        cell: ({ row }) =>
          editable && row.original.kind === 'detail' ? (
            <DecimalCell
              value={row.original.unitPrice}
              pattern={/^\d+$/}
              onCommit={(next) =>
                handleEditDetail(row.original, {
                  lockVersion: row.original.lockVersion,
                  unitPrice: next,
                })
              }
              formatDisplay={(v) => (v ? formatAmount(v) : '')}
            />
          ) : (
            <div className="text-right tabular-nums">
              {row.original.unitPrice && row.original.unitPrice !== '0'
                ? formatAmount(row.original.unitPrice)
                : '—'}
            </div>
          ),
        size: 140,
      },
      {
        id: 'amount',
        header: () => <div className="text-right">金額</div>,
        cell: ({ row }) => (
          <div className="text-right font-semibold tabular-nums">
            {formatAmount(row.original.amount)}
          </div>
        ),
        size: 160,
      },
    ],
    [editable, handleEditDetail],
  );

  const table = useReactTable({
    data: tree,
    columns,
    // ツリーは初期全展開 (= 内訳全行を一望できるエクセルライクな見せ方)
    initialState: { expanded: true },
    getSubRows: (row) => row.children,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="px-3 py-2 font-medium" style={{ width: h.getSize() }}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <BudgetTreeRow key={row.id} row={row} />
          ))}
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td className="px-3 py-3 text-muted-foreground" colSpan={columns.length}>
                明細がありません
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function BudgetTreeRow({ row }: { row: Row<BudgetItemNode> }) {
  const isSection = row.original.kind === 'section';
  const isComposite = row.original.kind === 'composite';
  return (
    <tr
      className={
        isSection
          ? 'border-t bg-blue-50/50 font-medium dark:bg-blue-950/20'
          : isComposite
            ? 'border-t bg-violet-50/40 dark:bg-violet-950/15'
            : 'border-t'
      }
    >
      {row.getVisibleCells().map((cell) => (
        <td key={cell.id} className="px-3 py-1.5 align-top">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}

/**
 * 数値文字列のインラインセル。
 * - 入力中の値は **string のまま** state に保持 (number キャスト禁止)
 * - blur で pattern match + 値が変わっていれば onCommit
 * - blur 後はサーバの正規化後値で再描画される (props が変わるため key で再 mount)
 */
function DecimalCell({
  value,
  pattern,
  onCommit,
  formatDisplay,
}: {
  value: string;
  pattern: RegExp;
  onCommit: (next: string) => Promise<void> | void;
  /** 表示用整形 (フォーカス外しの読みやすさ用)。fallback で raw 表示 */
  formatDisplay?: (v: string) => string;
}): React.ReactElement {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [pending, setPending] = useState(false);

  // props.value が変わった (= サーバ反映) ら state も同期。
  // ただし focused 中は触らない (入力中に上書きされるのを防止)
  if (!focused && draft !== value && !pending) {
    setDraft(value);
  }

  const invalid = !pattern.test(draft);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused || !formatDisplay ? draft : formatDisplay(draft)}
      onFocus={(e) => {
        setFocused(true);
        // 全選択して数字入力しやすく
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={async () => {
        setFocused(false);
        const trimmed = draft.trim();
        if (!pattern.test(trimmed)) {
          // 不正値は元に戻す
          setDraft(value);
          return;
        }
        if (trimmed === value) return;
        setPending(true);
        try {
          await onCommit(trimmed);
        } finally {
          setPending(false);
        }
      }}
      disabled={pending}
      aria-invalid={invalid || undefined}
      className={
        'h-7 w-full rounded-sm border px-2 text-right tabular-nums outline-none ' +
        (invalid
          ? 'border-destructive bg-destructive/10'
          : 'border-transparent bg-background focus:border-input focus:ring-1 focus:ring-input')
      }
    />
  );
}
