'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import type { BudgetHistoryEvent, BudgetHistoryEventType } from '@kgk/schemas';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getBudgetHistory } from '@/lib/api/budgets';
import { ApiError } from '@/lib/api/client';

/**
 * T33: ワークフロー履歴タイムライン Drawer。
 *
 * - 右側 sheet として `Dialog` primitive を直接使い、CSS で右固定スライドアウトに変換。
 * - open になった瞬間に履歴を取得 (closed の間は fetch しない)
 * - eventType ごとに色 + アイコンを差し替えて視覚化
 * - reject の reason は引用ブロックで強調
 * - revise / revise_from の対向版にジャンプ可能 (onJumpBudget があるとき)
 */

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectId: string;
  budgetId: string;
  /** 対向版に切替するためのコールバック (drawer は閉じてから呼ぶ) */
  onJumpBudget?: (newBudgetId: string) => Promise<void> | void;
}

export function BudgetHistoryDrawer({
  open,
  onOpenChange,
  projectId,
  budgetId,
  onJumpBudget,
}: Props): React.ReactElement {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<BudgetHistoryEvent[] | null>(null);

  // open になった瞬間に取得。budgetId が変わった場合も refetch。
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setEvents(null);
    getBudgetHistory(projectId, budgetId)
      .then((res) => {
        if (!cancelled) setEvents(res.items);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.show({
          kind: 'error',
          title: '履歴の取得に失敗しました',
          description: err instanceof ApiError ? err.message : '不明なエラー',
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, budgetId, toast]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          data-testid="budget-history-drawer"
          className="fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col gap-0 bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none duration-200 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right"
        >
          <header className="flex items-center justify-between border-b px-4 py-3">
            <DialogPrimitive.Title className="text-base font-semibold">
              ワークフロー履歴
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              render={
                <Button variant="ghost" size="icon-sm" aria-label="閉じる">
                  <XIcon />
                </Button>
              }
            />
          </header>

          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">読み込み中...</p>
            ) : events && events.length === 0 ? (
              <p className="text-sm text-muted-foreground">履歴はまだありません。</p>
            ) : events ? (
              <Timeline
                events={events}
                onJumpBudget={onJumpBudget}
                onClose={() => onOpenChange(false)}
              />
            ) : null}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// =====================================================================
// Timeline 本体
// =====================================================================

function Timeline({
  events,
  onJumpBudget,
  onClose,
}: {
  events: BudgetHistoryEvent[];
  onJumpBudget?: (newBudgetId: string) => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <ol className="relative ml-3 border-l border-border" data-testid="budget-history-timeline">
      {events.map((e) => (
        <TimelineRow
          key={e.id}
          event={e}
          onJumpBudget={
            onJumpBudget
              ? (id) => {
                  onClose();
                  void onJumpBudget(id);
                }
              : undefined
          }
        />
      ))}
    </ol>
  );
}

function TimelineRow({
  event,
  onJumpBudget,
}: {
  event: BudgetHistoryEvent;
  onJumpBudget?: (newBudgetId: string) => Promise<void> | void;
}): React.ReactElement {
  const style = EVENT_STYLES[event.eventType];
  const jumpTarget =
    event.eventType === 'revise'
      ? event.newBudgetId
      : event.eventType === 'revise_from'
        ? event.sourceBudgetId
        : null;
  const jumpLabel = event.eventType === 'revise' ? '新版を開く' : '改定元を開く';
  return (
    <li
      data-testid="budget-history-event"
      data-event-type={event.eventType}
      className="relative mb-5 pl-5"
    >
      <span
        aria-hidden="true"
        className={`absolute -left-[7px] top-1.5 inline-block size-3 rounded-full ring-2 ring-popover ${style.dot}`}
      />
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {formatDateTime(event.occurredAt)}
        </span>
        <span className="text-sm">
          <span className="font-medium">{event.actor.name ?? '(削除されたユーザ)'}</span>
          {' が '}
          <span className={`font-medium ${style.label}`}>{style.text}</span>
        </span>
      </div>
      {event.meta ? <MetaLine meta={event.meta} /> : null}
      {event.reason ? (
        <blockquote
          data-testid="budget-history-reason"
          className="mt-1.5 whitespace-pre-wrap rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {event.reason}
        </blockquote>
      ) : null}
      {jumpTarget && onJumpBudget ? (
        <button
          type="button"
          onClick={() => onJumpBudget(jumpTarget)}
          className="mt-1 inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-2 text-xs hover:bg-muted"
        >
          {jumpLabel}
        </button>
      ) : null}
    </li>
  );
}

function MetaLine({ meta }: { meta: Record<string, unknown> }): React.ReactElement | null {
  const parts: string[] = [];
  if (typeof meta.version === 'number') parts.push(`v${meta.version}`);
  if (typeof meta.status === 'string') parts.push(`status: ${meta.status}`);
  if (typeof meta.format === 'string') parts.push(meta.format as string);
  if (typeof meta.totalAmount === 'string') parts.push(`合計 ${meta.totalAmount} 円`);
  if (typeof meta.itemCount === 'number') parts.push(`明細 ${meta.itemCount} 件`);
  if (parts.length === 0) return null;
  return <p className="mt-0.5 text-xs text-muted-foreground">{parts.join(' ／ ')}</p>;
}

// =====================================================================
// イベント種別ごとのスタイル/ラベル
// =====================================================================

const EVENT_STYLES: Record<BudgetHistoryEventType, { dot: string; label: string; text: string }> = {
  create: {
    dot: 'bg-slate-400',
    label: 'text-slate-600 dark:text-slate-300',
    text: '作成しました',
  },
  submit: { dot: 'bg-blue-500', label: 'text-blue-700 dark:text-blue-300', text: '申請しました' },
  approve: {
    dot: 'bg-emerald-500',
    label: 'text-emerald-700 dark:text-emerald-300',
    text: '承認しました',
  },
  reject: { dot: 'bg-red-500', label: 'text-red-700 dark:text-red-300', text: '差戻しました' },
  revise: {
    dot: 'bg-violet-500',
    label: 'text-violet-700 dark:text-violet-300',
    text: '改定して新版を作成しました',
  },
  revise_from: {
    dot: 'bg-violet-400',
    label: 'text-violet-700 dark:text-violet-300',
    text: '改定で新版を作成しました',
  },
  export: {
    dot: 'bg-amber-500',
    label: 'text-amber-700 dark:text-amber-300',
    text: 'Excel 出力しました',
  },
};

/** ISO → "2026-05-17 14:05" (JST 想定、Intl.DateTimeFormat 経由) */
function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function XIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
