'use client';

import { Button } from '@/components/ui/button';

/**
 * 履歴 drawer の開閉トリガ。
 * - state は呼び出し元 (BudgetHeaderEditor) で持つ
 * - status 不問で常時表示 (Excel ボタンと同方針)
 */

interface Props {
  onOpen: () => void;
}

export function BudgetHistoryButton({ onOpen }: Props): React.ReactElement {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onOpen}
      aria-label="ワークフロー履歴"
      data-testid="budget-history-button"
    >
      <ClockIcon />
      履歴
    </Button>
  );
}

/** 依存ゼロの clock SVG (lucide-react を追加しない方針継続) */
function ClockIcon(): React.ReactElement {
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
      className="mr-1 inline-block"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
