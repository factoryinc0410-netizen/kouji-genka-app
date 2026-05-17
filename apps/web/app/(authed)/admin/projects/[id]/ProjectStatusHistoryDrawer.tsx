'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import type { ProjectStatusHistoryEntry } from '@kgk/schemas';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ProjectStatusBadge } from '@/components/ui/project-status-badge';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/client';
import { getProjectStatusHistory } from '@/lib/api/projects';

/**
 * T34: 工事ステータス遷移履歴の Drawer (T33 と同じ右側 sheet パターン)。
 *
 * - open になった瞬間に GET /projects/:id/status-history を呼ぶ
 * - 各行: changedAt (JST) / 「ProjectStatusBadge from → ProjectStatusBadge to」 / 変更者 / reason
 * - reason は引用ブロックで強調
 * - 削除済ユーザは「(削除されたユーザ)」表示
 */

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectId: string;
}

export function ProjectStatusHistoryDrawer({
  open,
  onOpenChange,
  projectId,
}: Props): React.ReactElement {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ProjectStatusHistoryEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setEvents(null);
    getProjectStatusHistory(projectId)
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
  }, [open, projectId, toast]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          data-testid="project-status-history-drawer"
          className="fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col gap-0 bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none duration-200 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right"
        >
          <header className="flex items-center justify-between border-b px-4 py-3">
            <DialogPrimitive.Title className="text-base font-semibold">
              ステータス変遷履歴
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
              <p className="text-sm text-muted-foreground">遷移履歴はまだありません。</p>
            ) : events ? (
              <Timeline events={events} />
            ) : null}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Timeline({ events }: { events: ProjectStatusHistoryEntry[] }): React.ReactElement {
  return (
    <ol
      className="relative ml-3 border-l border-border"
      data-testid="project-status-history-timeline"
    >
      {events.map((e) => (
        <li
          key={e.id}
          data-testid="project-status-history-event"
          data-to={e.toStatus}
          className="relative mb-5 pl-5"
        >
          <span
            aria-hidden="true"
            className="absolute -left-[7px] top-1.5 inline-block size-3 rounded-full bg-blue-500 ring-2 ring-popover"
          />
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {formatDateTime(e.changedAt)}
            </span>
            <span className="text-sm">
              <span className="font-medium">{e.changedByName ?? '(削除されたユーザ)'}</span>
              {' が変更'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {e.fromStatus ? (
              <ProjectStatusBadge status={e.fromStatus} size="xs" />
            ) : (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                (新規)
              </span>
            )}
            <span aria-hidden="true" className="text-xs text-muted-foreground">
              →
            </span>
            <ProjectStatusBadge status={e.toStatus} size="xs" />
          </div>
          {e.reason ? (
            <blockquote
              data-testid="project-status-history-reason"
              className="mt-1.5 whitespace-pre-wrap rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
            >
              {e.reason}
            </blockquote>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

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
