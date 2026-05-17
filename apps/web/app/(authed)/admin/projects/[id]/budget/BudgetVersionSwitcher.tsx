'use client';

import type { Budget } from '@kgk/schemas';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatAmount } from '@/lib/format';

/**
 * T31: バージョン切替 dropdown。
 *
 * - Trigger は BudgetHeaderEditor 内の「version N / status: X」表示を置換
 * - Popup の各行に: ✓ (現在表示中) / v番号 / StatusBadge / 日時 / 金額 / 「現行」タグ (最新 approved)
 * - 1 版しか無い時も同じ trigger を表示し、popup を開くと 1 行だけ並ぶ (UI 一貫性)
 * - 並び順は version desc (`listBudgets` のまま、最新が最上段)
 *
 * 業務観点: 「現行」= 承認された最新の版 (= approved または superseded で version 最大)。
 * 改定中は v1=superseded + v2=draft になるが、この場合 v1 が「直前まで承認されていた正本」
 * として「現行」タグの対象。改定後に v2 が approved になったら v2 が新「現行」に切替。
 * これにより「いま編集中なのが draft v2 でも、正本は v1」が一目で分かる。
 */

interface Props {
  budgets: Budget[];
  currentBudgetId: string;
  onSelect: (budgetId: string) => Promise<void> | void;
}

export function BudgetVersionSwitcher({
  budgets,
  currentBudgetId,
  onSelect,
}: Props): React.ReactElement {
  const current = budgets.find((b) => b.id === currentBudgetId);

  // 「現行」= 承認された最新の版。listBudgets が version desc 済なので、
  // approved または superseded のうち最初に当たったもの (= 最大 version) を採用。
  // draft / pending_approval はまだ承認されていないので対象外。
  const liveId =
    budgets.find((b) => b.status === 'approved' || b.status === 'superseded')?.id ?? null;

  return (
    <DropdownMenu
      align="left"
      trigger={
        <button
          type="button"
          data-testid="budget-version-switcher"
          aria-label="バージョン切替"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {current ? (
            <>
              <span className="font-mono font-medium">v{current.version}</span>
              <StatusBadge status={current.status} size="xs" />
            </>
          ) : (
            <span className="text-muted-foreground">(版なし)</span>
          )}
          <ChevronDown />
        </button>
      }
    >
      {(close) => (
        <ul
          data-testid="budget-version-list"
          className="min-w-[280px] max-h-[60vh] overflow-y-auto py-1"
        >
          {budgets.map((b) => {
            const isCurrent = b.id === currentBudgetId;
            const isLive = b.id === liveId;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  data-testid="budget-version-item"
                  data-version={b.version}
                  data-current={isCurrent ? 'true' : 'false'}
                  data-live={isLive ? 'true' : 'false'}
                  onClick={() => {
                    close();
                    void onSelect(b.id);
                  }}
                  className={
                    'flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-muted ' +
                    (isCurrent ? 'bg-muted/60' : '')
                  }
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                  >
                    {isCurrent ? <CheckIcon /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-medium">v{b.version}</span>
                      <StatusBadge status={b.status} size="xs" />
                      {isLive ? (
                        <span
                          data-testid="budget-version-live-tag"
                          className="rounded-full border border-emerald-400 bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                        >
                          現行
                        </span>
                      ) : null}
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {formatDate(b.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                      {formatAmount(b.totalAmount)} 円{b.title ? ` ／ ${b.title}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </DropdownMenu>
  );
}

/** ISO → "2026-05-17 14:00" JST */
function formatDate(iso: string): string {
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

function ChevronDown(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="12"
      height="12"
      aria-hidden="true"
      className="text-muted-foreground"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="12"
      height="12"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
