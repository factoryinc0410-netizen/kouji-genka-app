'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BudgetItem, BudgetItemKind, UpdateBudgetItemRequest } from '@kgk/schemas';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  type Row,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DropdownItem, DropdownMenu, DropdownSeparator } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/toast';
import { createBudgetItem, deleteBudgetItem, updateBudgetItem } from '@/lib/api/budgets';
import { ApiError } from '@/lib/api/client';
import { type BudgetItemNode, buildBudgetTree } from '@/lib/budget-tree';
import { formatAmount } from '@/lib/format';
import { BudgetItemEditDialog } from './BudgetItemEditDialog';

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
  /** 親に items の再取得を要求する。完了 Promise を返すことで連続編集時の race を防ぐ */
  onRefresh: () => Promise<void> | void;
  onItemUpdated: (updated: BudgetItem) => void;
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

  // 連続操作による不整合防止 (1 操作中は再操作を弾く)
  const [busy, setBusy] = useState(false);
  // 「編集」ダイアログの対象。null = 非表示。
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const withBusy = useCallback(
    async (fn: () => Promise<void>): Promise<void> => {
      if (busy) return;
      setBusy(true);
      try {
        await fn();
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const handleApiError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.code === 'BUDGET_ITEM_VERSION_MISMATCH') {
        toast.show({
          kind: 'warning',
          title: '他のユーザによって更新されました',
          description: '最新の値をリロードしてから再度操作してください。',
          actionLabel: '最新を取得',
          onAction: onRefresh,
        });
        return;
      }
      toast.show({
        kind: 'error',
        title: fallback,
        description: err instanceof ApiError ? err.message : '不明なエラー',
      });
    },
    [toast, onRefresh],
  );

  // ---------- インライン編集 (数量・単価・文字列フィールド共通) ----------
  // 楽観ロックを呼び出し側に意識させず、現行 lockVersion を内部で付与する。
  // ※ 文字列フィールド (code/name/spec/unit/notes) のみの変更時は
  //   Service 側で rollUp をスキップする最適化が効くため、UI 側は気にせず呼べる。
  // ※ withBusy で包まない: インライン編集は連続発火 (qty → price 即時 blur など) するため、
  //   ガードでサイレントドロップせず、競合は楽観ロック (409) で守る。
  //   見た目の busy は setBusy(true/false) を直接立てて反映。
  const handlePatch = useCallback(
    async (item: BudgetItem, body: Omit<UpdateBudgetItemRequest, 'lockVersion'>): Promise<void> => {
      setBusy(true);
      try {
        const res = await updateBudgetItem(projectId, budgetId, item.id, {
          lockVersion: item.lockVersion,
          ...body,
        });
        onItemUpdated(res.item);
        // 親の refetch (items GET) を await することで、後続の連続編集が
        // 旧 lockVersion を持った古い row.original でコミットされる race を防ぐ
        await onRefresh();
      } catch (err) {
        handleApiError(err, '更新に失敗しました');
      } finally {
        setBusy(false);
      }
    },
    [projectId, budgetId, onItemUpdated, onRefresh, handleApiError],
  );

  // ---------- アクション: 同階層追加 / 子追加 / 削除 ----------
  const addSibling = useCallback(
    (item: BudgetItem) =>
      withBusy(async () => {
        try {
          await createBudgetItem(projectId, budgetId, {
            parentId: item.parentId ?? undefined,
            kind: item.kind,
            name:
              item.kind === 'detail'
                ? '新規明細'
                : item.kind === 'composite'
                  ? '新規代価'
                  : '新規科目',
            costElement: item.kind === 'detail' ? (item.costElement ?? 'material') : undefined,
          });
          onRefresh();
        } catch (err) {
          handleApiError(err, '行の追加に失敗しました');
        }
      }),
    [projectId, budgetId, onRefresh, withBusy, handleApiError],
  );

  const addChild = useCallback(
    (item: BudgetItem) =>
      withBusy(async () => {
        try {
          await createBudgetItem(projectId, budgetId, {
            parentId: item.id,
            kind: 'detail',
            name: '新規明細',
            costElement: 'material',
          });
          onRefresh();
        } catch (err) {
          handleApiError(err, '行の追加に失敗しました');
        }
      }),
    [projectId, budgetId, onRefresh, withBusy, handleApiError],
  );

  const removeRow = useCallback(
    (item: BudgetItem) =>
      withBusy(async () => {
        if (!confirm(`「${item.code ?? ''} ${item.name}」を削除します。よろしいですか?`)) return;
        try {
          await deleteBudgetItem(projectId, budgetId, item.id, item.lockVersion);
          onRefresh();
        } catch (err) {
          handleApiError(err, '行の削除に失敗しました');
        }
      }),
    [projectId, budgetId, onRefresh, withBusy, handleApiError],
  );

  // ---------- 新規 root 行を追加 (テーブル外のボタンから) ----------
  const addRootSection = useCallback(
    () =>
      withBusy(async () => {
        try {
          await createBudgetItem(projectId, budgetId, { kind: 'section', name: '新規科目' });
          onRefresh();
        } catch (err) {
          handleApiError(err, '行の追加に失敗しました');
        }
      }),
    [projectId, budgetId, onRefresh, withBusy, handleApiError],
  );

  // ---------- DnD ----------
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // フラットな id 配列を SortableContext に渡す (TanStack の rowModel を呼ぶ前に既知の順序)
  const flatIds = useMemo(() => flattenIds(tree), [tree]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeItem = items.find((i) => i.id === active.id);
      const overItem = items.find((i) => i.id === over.id);
      if (!activeItem || !overItem) return;

      // ルール:
      //  - 同じ parent の別行に drop → 兄弟並び替え (displayOrder を入れ替え)
      //  - 異なる親の section/composite に drop → その親の末尾に移動 (parentId 変更)
      //  - detail 葉に drop → 同じ parent への並び替えとして扱う
      void withBusy(async () => {
        try {
          if (activeItem.parentId === overItem.parentId) {
            // 同階層内 reorder: 兄弟の displayOrder を再採番せず、簡易に
            // 「over の displayOrder」と「(over の前 or 後ろ の displayOrder)」の中間値に挿入
            const siblings = items
              .filter((i) => i.parentId === activeItem.parentId && i.id !== activeItem.id)
              .sort((a, b) => a.displayOrder - b.displayOrder);
            const overIdx = siblings.findIndex((s) => s.id === overItem.id);
            // 「下に挿入」を既定とする (over の表示位置の下に置く)
            const after = siblings[overIdx]?.displayOrder ?? 0;
            const before = siblings[overIdx + 1]?.displayOrder ?? after + 2000;
            const next = Math.floor((after + before) / 2);
            await updateBudgetItem(projectId, budgetId, activeItem.id, {
              lockVersion: activeItem.lockVersion,
              displayOrder: next,
            });
            onRefresh();
            return;
          }

          // 親付け替え: drop 先が section/composite なら "その親の末尾" に移動
          if (overItem.kind === 'section' || overItem.kind === 'composite') {
            const targetSiblings = items.filter((i) => i.parentId === overItem.id);
            const tailOrder =
              targetSiblings.length === 0
                ? 1000
                : Math.max(...targetSiblings.map((s) => s.displayOrder)) + 1000;
            await updateBudgetItem(projectId, budgetId, activeItem.id, {
              lockVersion: activeItem.lockVersion,
              parentId: overItem.id,
              displayOrder: tailOrder,
            });
            onRefresh();
            return;
          }

          // drop 先が detail (葉) の場合 → 同じ親 (over.parentId) の "その over の後ろ" に並び替え
          const newParentId = overItem.parentId ?? null;
          const siblings = items
            .filter((i) => i.parentId === newParentId && i.id !== activeItem.id)
            .sort((a, b) => a.displayOrder - b.displayOrder);
          const overIdx = siblings.findIndex((s) => s.id === overItem.id);
          const after = siblings[overIdx]?.displayOrder ?? 0;
          const before = siblings[overIdx + 1]?.displayOrder ?? after + 2000;
          const next = Math.floor((after + before) / 2);
          await updateBudgetItem(projectId, budgetId, activeItem.id, {
            lockVersion: activeItem.lockVersion,
            parentId: newParentId,
            displayOrder: next,
          });
          onRefresh();
        } catch (err) {
          handleApiError(err, '並べ替えに失敗しました');
        }
      });
    },
    [items, projectId, budgetId, onRefresh, withBusy, handleApiError],
  );

  // ---------- columns ----------
  const columns = useMemo<ColumnDef<BudgetItemNode>[]>(
    () => [
      {
        id: 'handle',
        header: '',
        size: 28,
        cell: ({ row }) =>
          editable ? <DragHandle id={row.original.id} /> : <span className="inline-block w-4" />,
      },
      {
        id: 'code',
        header: 'コード',
        size: 140,
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
            <EditableTextCell
              ariaLabel="コード"
              value={row.original.code}
              maxLength={50}
              className="font-mono text-xs"
              disabled={!editable}
              onCommit={(next) => handlePatch(row.original, { code: next })}
            />
          </div>
        ),
      },
      {
        id: 'name',
        header: '摘要',
        size: 280,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <EditableTextCell
              ariaLabel="名称"
              value={row.original.name}
              required
              maxLength={200}
              disabled={!editable}
              onCommit={(next) => handlePatch(row.original, { name: next ?? '' })}
            />
            {row.original.kind === 'detail' ? (
              <EditableTextCell
                ariaLabel="仕様"
                value={row.original.spec}
                maxLength={2000}
                emptyDisplay="(仕様を追加)"
                className="text-xs text-muted-foreground"
                disabled={!editable}
                onCommit={(next) => handlePatch(row.original, { spec: next })}
              />
            ) : row.original.spec ? (
              <div className="text-xs text-muted-foreground">{row.original.spec}</div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'kind',
        header: '種別',
        size: 60,
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
      },
      {
        id: 'costElement',
        header: '原価',
        size: 60,
        cell: ({ row }) =>
          row.original.costElement ? (
            <span className="text-xs">{COST_ELEMENT_LABEL[row.original.costElement]}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: 'unit',
        header: '単位',
        size: 60,
        cell: ({ row }) =>
          row.original.kind === 'detail' ? (
            <EditableTextCell
              ariaLabel="単位"
              value={row.original.unit}
              maxLength={20}
              className="text-xs"
              disabled={!editable}
              onCommit={(next) => handlePatch(row.original, { unit: next })}
            />
          ) : (
            <span className="text-xs">{row.original.unit ?? '—'}</span>
          ),
      },
      {
        id: 'quantity',
        header: () => <div className="text-right">数量</div>,
        size: 120,
        cell: ({ row }) =>
          editable && row.original.kind === 'detail' ? (
            <DecimalCell
              value={row.original.quantity}
              pattern={/^\d+(\.\d{1,4})?$/}
              onCommit={(next) => handlePatch(row.original, { quantity: next })}
            />
          ) : (
            <div className="text-right tabular-nums">{row.original.quantity}</div>
          ),
      },
      {
        id: 'unitPrice',
        header: () => <div className="text-right">単価</div>,
        size: 140,
        cell: ({ row }) =>
          editable && row.original.kind === 'detail' ? (
            <DecimalCell
              value={row.original.unitPrice}
              pattern={/^\d+$/}
              onCommit={(next) => handlePatch(row.original, { unitPrice: next })}
              formatDisplay={(v) => (v ? formatAmount(v) : '')}
            />
          ) : (
            <div className="text-right tabular-nums">
              {row.original.unitPrice && row.original.unitPrice !== '0'
                ? formatAmount(row.original.unitPrice)
                : '—'}
            </div>
          ),
      },
      {
        id: 'amount',
        header: () => <div className="text-right">金額</div>,
        size: 160,
        cell: ({ row }) => (
          <div className="text-right font-semibold tabular-nums">
            {formatAmount(row.original.amount)}
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        size: 36,
        cell: ({ row }) =>
          editable ? (
            <RowActions
              item={row.original}
              onEdit={() => setEditingItem(row.original)}
              onAddSibling={() => void addSibling(row.original)}
              onAddChild={() => void addChild(row.original)}
              onDelete={() => void removeRow(row.original)}
            />
          ) : null,
      },
    ],
    [editable, handlePatch, addSibling, addChild, removeRow],
  );

  const table = useReactTable({
    data: tree,
    columns,
    initialState: { expanded: true },
    getSubRows: (row) => row.children,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <div className="space-y-2">
      {editable ? (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => void addRootSection()}
            disabled={busy}
            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-muted disabled:opacity-50"
          >
            + 科目を追加
          </button>
        </div>
      ) : null}

      {editingItem ? (
        <BudgetItemEditDialog
          open={editingItem !== null}
          item={editingItem}
          projectId={projectId}
          budgetId={budgetId}
          onOpenChange={(open) => {
            if (!open) setEditingItem(null);
          }}
          onSaved={async () => {
            setEditingItem(null);
            // インライン編集と同じ busy ライフサイクルにのせる: refetch 完了まで busy=true
            setBusy(true);
            try {
              await onRefresh();
            } finally {
              setBusy(false);
            }
          }}
          onConflict={() => {
            setEditingItem(null);
            toast.show({
              kind: 'warning',
              title: '他のユーザによって更新されました',
              description: '最新の値をリロードしてから再度操作してください。',
              actionLabel: '最新を取得',
              onAction: onRefresh,
            });
          }}
        />
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
          <div
            data-testid="budget-table"
            data-busy={busy ? 'true' : 'false'}
            className={`overflow-x-auto rounded-md border bg-card ${busy ? 'opacity-70' : ''}`}
          >
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        className="px-3 py-2 font-medium"
                        style={{ width: h.getSize() }}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <SortableRow key={row.id} row={row} />
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
        </SortableContext>
      </DndContext>
    </div>
  );
}

// =====================================================================
// Sortable row (TanStack の row を dnd-kit useSortable でラップ)
// =====================================================================

function SortableRow({ row }: { row: Row<BudgetItemNode> }) {
  const { attributes, transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.original.id,
  });
  const isSection = row.original.kind === 'section';
  const isComposite = row.original.kind === 'composite';
  return (
    <tr
      ref={setNodeRef}
      {...attributes}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
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

function DragHandle({ id }: { id: string }) {
  const { attributes, listeners } = useSortable({ id });
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="ドラッグして並べ替え"
      className="inline-flex h-5 w-4 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
    >
      ⋮⋮
    </button>
  );
}

// =====================================================================
// 行アクションメニュー
// =====================================================================

function RowActions({
  item,
  onEdit,
  onAddSibling,
  onAddChild,
  onDelete,
}: {
  item: BudgetItem;
  onEdit: () => void;
  onAddSibling: () => void;
  onAddChild: () => void;
  onDelete: () => void;
}) {
  // detail は子を持てない → "子要素として追加" は非表示
  const canAddChild = item.kind !== ('detail' as BudgetItemKind);
  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          aria-label="行アクション"
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
        >
          ⋮
        </button>
      }
    >
      {(close) => (
        <>
          <DropdownItem
            onClick={() => {
              close();
              onEdit();
            }}
          >
            編集
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            onClick={() => {
              close();
              onAddSibling();
            }}
          >
            同じ階層に追加
          </DropdownItem>
          {canAddChild ? (
            <DropdownItem
              onClick={() => {
                close();
                onAddChild();
              }}
            >
              子要素として追加
            </DropdownItem>
          ) : (
            <DropdownItem disabled>子要素として追加</DropdownItem>
          )}
          <DropdownSeparator />
          <DropdownItem
            destructive
            onClick={() => {
              close();
              onDelete();
            }}
          >
            削除
          </DropdownItem>
        </>
      )}
    </DropdownMenu>
  );
}

// =====================================================================
// helpers
// =====================================================================

function flattenIds(nodes: BudgetItemNode[]): string[] {
  const out: string[] = [];
  const walk = (xs: BudgetItemNode[]): void => {
    for (const x of xs) {
      out.push(x.id);
      if (x.children.length) walk(x.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * テキストフィールドのインラインセル (click-to-edit)。
 * - 通常表示: テキスト + hover ハイライト (空なら emptyDisplay をプレースホルダ)
 * - クリック: <input> に切替、autofocus
 * - blur / Enter: 値を trim → 変化があれば onCommit、変化なしならそのまま閉じる
 * - Esc: 編集破棄
 * - required: 空 (trim 後 '') は無視して元の値に戻す (Service 側でも 400 になるが UI 層で吸収)
 * - 空文字は **null** として送信するので、Schema 側 `.nullable().optional()` に合う
 */
function EditableTextCell({
  value,
  required,
  maxLength,
  emptyDisplay = '—',
  className,
  ariaLabel,
  disabled,
  onCommit,
}: {
  value: string | null;
  required?: boolean;
  maxLength: number;
  emptyDisplay?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onCommit: (next: string | null) => Promise<void> | void;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 親から value が更新されたら draft を同期 (編集中/送信中でない場合に限る)
  if (!editing && !pending && draft !== (value ?? '')) {
    setDraft(value ?? '');
  }

  // 編集モード開始直後にフォーカス + 全選択 (autoFocus 属性は a11y 違反のため useEffect で)
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          setDraft(value ?? '');
          setEditing(true);
        }}
        className={
          'w-full rounded-sm px-1 py-0.5 text-left ' +
          (disabled
            ? 'cursor-default'
            : 'cursor-text hover:bg-muted/50 focus:bg-muted/50 focus:outline-none') +
          (className ? ` ${className}` : '')
        }
      >
        {value ? value : <span className="text-muted-foreground/60 italic">{emptyDisplay}</span>}
      </button>
    );
  }

  const commit = async (): Promise<void> => {
    const trimmed = draft.trim();
    if (required && trimmed === '') {
      // 必須フィールドが空 → 編集破棄
      setDraft(value ?? '');
      setEditing(false);
      return;
    }
    const normalized = trimmed === '' ? null : trimmed;
    if ((normalized ?? '') === (value ?? '')) {
      setEditing(false);
      return;
    }
    setPending(true);
    try {
      await onCommit(normalized);
    } finally {
      setPending(false);
      setEditing(false);
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      maxLength={maxLength}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        void commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(value ?? '');
          setEditing(false);
        }
      }}
      disabled={pending}
      className={
        'h-7 w-full rounded-sm border border-input bg-background px-1 outline-none focus:ring-1 focus:ring-input ' +
        (className ?? '')
      }
    />
  );
}

/**
 * 数値文字列のインラインセル。
 * - 入力中の値は string のまま state に保持 (number キャスト禁止)
 * - blur で pattern match + 値が変わっていれば onCommit
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
  formatDisplay?: (v: string) => string;
}): React.ReactElement {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [pending, setPending] = useState(false);

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
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={async () => {
        setFocused(false);
        const trimmed = draft.trim();
        if (!pattern.test(trimmed)) {
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
