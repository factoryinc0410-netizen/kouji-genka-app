'use client';

import type { Budget, Project } from '@kgk/schemas';
import { useCallback, useState } from 'react';
import { EditableText } from '@/components/ui/editable-text';
import { useToast } from '@/components/ui/toast';
import { updateBudget } from '@/lib/api/budgets';
import { ApiError } from '@/lib/api/client';
import { formatAmount } from '@/lib/format';
import { BudgetExportButton } from './BudgetExportButton';
import { BudgetHeaderDialog } from './BudgetHeaderDialog';
import { BudgetHistoryButton } from './BudgetHistoryButton';
import { BudgetHistoryDrawer } from './BudgetHistoryDrawer';
import { BudgetVersionSwitcher } from './BudgetVersionSwitcher';
import { BudgetWorkflowActions } from './BudgetWorkflowActions';

/**
 * Budget ページのヘッダ部 (title / version / status / 合計 / 備考プレビュー)。
 * - title はインライン click-to-edit (EditableText)
 * - notes は長文のため「備考を編集」ボタン → BudgetHeaderDialog
 * - editable は外部 (page) から `status === 'draft'` で渡される
 * - 全ての save / commit 後に onRefresh を await
 */

interface Props {
  project: Project;
  budget: Budget;
  projectId: string;
  editable: boolean;
  /** バージョン切替 dropdown 用。listBudgets の version desc を維持して渡す */
  budgets: Budget[];
  onRefresh: () => Promise<void> | void;
  /** 改定 (revise) / バージョン切替時に表示する budget の id を切替えるためのコールバック */
  onSwitchBudget: (newBudgetId: string) => Promise<void> | void;
}

export function BudgetHeaderEditor({
  project,
  budget,
  projectId,
  editable,
  budgets,
  onRefresh,
  onSwitchBudget,
}: Props): React.ReactElement {
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleConflict = useCallback(() => {
    toast.show({
      kind: 'warning',
      title: '他のユーザによって更新されました',
      description: '最新の値をリロードしてから再度操作してください。',
      actionLabel: '最新を取得',
      onAction: () => void onRefresh(),
    });
  }, [toast, onRefresh]);

  /**
   * インライン title commit。EditableText から呼ばれる。
   * - 楽観ロック付きで PATCH → 409 はトースト、その他エラーもトースト
   * - 成功時は onRefresh を await して busy 状態 (親) を正しく解く
   */
  const commitTitle = useCallback(
    async (next: string | null): Promise<void> => {
      try {
        await updateBudget(projectId, budget.id, {
          lockVersion: budget.lockVersion,
          title: next,
        });
        await onRefresh();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'BUDGET_VERSION_MISMATCH') {
          handleConflict();
          return;
        }
        toast.show({
          kind: 'error',
          title: 'タイトルの更新に失敗しました',
          description: err instanceof ApiError ? err.message : '不明なエラー',
        });
      }
    },
    [projectId, budget.id, budget.lockVersion, onRefresh, handleConflict, toast],
  );

  return (
    <>
      {dialogOpen ? (
        <BudgetHeaderDialog
          open={dialogOpen}
          budget={budget}
          projectId={projectId}
          onOpenChange={setDialogOpen}
          onSaved={async () => {
            setDialogOpen(false);
            await onRefresh();
          }}
          onConflict={() => {
            setDialogOpen(false);
            handleConflict();
          }}
        />
      ) : null}

      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            <span className="font-mono text-base text-muted-foreground">{project.code}</span>
            <span>実行予算</span>
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <EditableText
              ariaLabel="予算タイトル"
              value={budget.title}
              maxLength={200}
              emptyDisplay="(タイトル未設定)"
              className="text-base text-foreground"
              disabled={!editable}
              onCommit={commitTitle}
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <BudgetVersionSwitcher
              budgets={budgets}
              currentBudgetId={budget.id}
              onSelect={onSwitchBudget}
            />
            {editable ? (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="text-foreground underline-offset-2 hover:underline"
              >
                備考を編集
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Excel 出力 / 履歴は status 不問で常時表示 (記録目的) */}
          <div className="flex items-center gap-2">
            <BudgetHistoryButton onOpen={() => setHistoryOpen(true)} />
            <BudgetExportButton projectId={projectId} budgetId={budget.id} />
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">合計</div>
            <div className="text-xl font-semibold tabular-nums">
              {formatAmount(budget.totalAmount)} 円
            </div>
          </div>
          <BudgetWorkflowActions
            projectId={projectId}
            budget={budget}
            projectStatus={project.status}
            onRefresh={onRefresh}
            onSwitchBudget={onSwitchBudget}
          />
        </div>
      </div>

      <BudgetHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        projectId={projectId}
        budgetId={budget.id}
        onJumpBudget={onSwitchBudget}
      />

      {budget.notes ? (
        <p
          data-testid="budget-notes-preview"
          className="line-clamp-2 max-w-3xl rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          {budget.notes}
        </p>
      ) : null}
    </>
  );
}
