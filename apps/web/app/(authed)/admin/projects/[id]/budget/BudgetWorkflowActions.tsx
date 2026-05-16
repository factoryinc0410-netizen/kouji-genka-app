'use client';

import type { Budget } from '@kgk/schemas';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { me } from '@/lib/api/auth';
import { approveBudget, rejectBudget, reviseBudget, submitBudget } from '@/lib/api/budgets';
import { ApiError } from '@/lib/api/client';
import { BudgetRejectDialog } from './BudgetRejectDialog';

/**
 * 予算ヘッダ横のワークフロー操作群。
 *
 * 状態別の表示:
 * - draft            : [申請する]
 * - pending_approval : [承認する] (admin) + [差戻す] (admin)
 * - approved         : [改定して新版を作成]
 * - superseded       : (表示なし、read-only)
 *
 * 改定 (revise) は新 draft の id を返す。親に `onSwitchBudget(newId)` を渡してもらい、
 * 新版へ自動切替する。他の操作は単に `onRefresh()`。
 *
 * 認可は最終的にバックエンド (admin 限定) で行うが、UI 側でも `isAdmin` で
 * 承認/差戻しボタンを非表示にして UX を整える。
 */

interface Props {
  projectId: string;
  budget: Budget;
  onRefresh: () => Promise<void> | void;
  /** 改定成功時に新 budget id へ切替するためのコールバック */
  onSwitchBudget: (newBudgetId: string) => Promise<void> | void;
}

export function BudgetWorkflowActions({
  projectId,
  budget,
  onRefresh,
  onSwitchBudget,
}: Props): React.ReactElement | null {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  // 現在のユーザロールを取得。承認 / 差戻しは admin 限定 (API 側でも検証されるが
  // UI 側でもボタンを出さない方が UX が綺麗)。
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    me()
      .then((res) => setIsAdmin(res.user.role.code === 'admin'))
      .catch(() => setIsAdmin(false));
  }, []);

  /** API 呼出を共通化: 楽観ロック衝突 / 状態遷移エラー / その他 を トーストで提示 */
  const run = useCallback(
    async (label: string, fn: () => Promise<void>): Promise<void> => {
      if (pending) return;
      setPending(true);
      try {
        await fn();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'BUDGET_VERSION_MISMATCH') {
          toast.show({
            kind: 'warning',
            title: '他のユーザによって更新されました',
            description: '最新の値をリロードしてから再度操作してください。',
            actionLabel: '最新を取得',
            onAction: () => void onRefresh(),
          });
          return;
        }
        if (err instanceof ApiError && err.code === 'INVALID_STATUS_TRANSITION') {
          toast.show({
            kind: 'warning',
            title: 'ステータスが変わっています',
            description: '最新の状態を取得してから再度操作してください。',
            actionLabel: '最新を取得',
            onAction: () => void onRefresh(),
          });
          return;
        }
        toast.show({
          kind: 'error',
          title: `${label}に失敗しました`,
          description: err instanceof ApiError ? err.message : '不明なエラー',
        });
      } finally {
        setPending(false);
      }
    },
    [pending, toast, onRefresh],
  );

  const handleSubmit = useCallback(async () => {
    if (!confirm('この予算を申請しますか?\n申請後は明細・タイトル・備考が編集できなくなります。'))
      return;
    await run('申請', async () => {
      await submitBudget(projectId, budget.id, budget.lockVersion);
      toast.show({ kind: 'success', title: '予算を申請しました' });
      await onRefresh();
    });
  }, [projectId, budget.id, budget.lockVersion, run, toast, onRefresh]);

  const handleApprove = useCallback(async () => {
    if (!confirm('この予算を承認しますか?\n承認後は内容を変更できなくなります。')) return;
    await run('承認', async () => {
      await approveBudget(projectId, budget.id, budget.lockVersion);
      toast.show({ kind: 'success', title: '予算を承認しました' });
      await onRefresh();
    });
  }, [projectId, budget.id, budget.lockVersion, run, toast, onRefresh]);

  const handleReject = useCallback(
    async (comment: string | undefined) => {
      await run('差戻し', async () => {
        await rejectBudget(projectId, budget.id, budget.lockVersion, comment);
        setRejectOpen(false);
        toast.show({ kind: 'success', title: '予算を差戻しました' });
        await onRefresh();
      });
    },
    [projectId, budget.id, budget.lockVersion, run, toast, onRefresh],
  );

  const handleRevise = useCallback(async () => {
    if (
      !confirm(
        'この予算を改定して新しいバージョン (draft) を作成しますか?\n現在の予算は「supersededed」となり、新 draft が編集可能になります。',
      )
    )
      return;
    await run('改定', async () => {
      const res = await reviseBudget(projectId, budget.id, budget.lockVersion);
      toast.show({
        kind: 'success',
        title: `v${res.budget.version} を作成しました`,
        description: '新しい draft に切替えました',
      });
      await onSwitchBudget(res.budget.id);
    });
  }, [projectId, budget.id, budget.lockVersion, run, toast, onSwitchBudget]);

  // ボタン群
  const buttons: React.ReactElement[] = [];

  if (budget.status === 'draft') {
    buttons.push(
      <Button key="submit" size="sm" onClick={handleSubmit} disabled={pending}>
        申請する
      </Button>,
    );
  }
  if (budget.status === 'pending_approval' && isAdmin) {
    buttons.push(
      <Button key="approve" size="sm" onClick={handleApprove} disabled={pending}>
        承認する
      </Button>,
      <Button
        key="reject"
        size="sm"
        variant="outline"
        onClick={() => setRejectOpen(true)}
        disabled={pending}
      >
        差戻す
      </Button>,
    );
  }
  if (budget.status === 'approved') {
    buttons.push(
      <Button key="revise" size="sm" variant="outline" onClick={handleRevise} disabled={pending}>
        改定して新版を作成
      </Button>,
    );
  }

  if (buttons.length === 0) return null;

  return (
    <>
      <BudgetRejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={handleReject}
        pending={pending}
      />
      <div className="flex items-center gap-2">{buttons}</div>
    </>
  );
}
