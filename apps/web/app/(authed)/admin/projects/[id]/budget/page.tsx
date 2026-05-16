'use client';

import type { Budget, BudgetItem, Project } from '@kgk/schemas';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { getBudget, listBudgetItems, listBudgets } from '@/lib/api/budgets';
import { ApiError } from '@/lib/api/client';
import { getProject } from '@/lib/api/projects';
import { BudgetHeaderEditor } from './BudgetHeaderEditor';
import { BudgetTreeTable } from './BudgetTreeTable';

/**
 * 工事 × 予算ページ (admin).
 * MVP: 1 つの最新 Budget (status=draft 優先、なければ list[0]) をデフォルト表示する。
 * 複数 version の切替えは将来 (Tabs 等) で導入予定。
 */
export default function ProjectBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id: projectId } = use(params);

  const [project, setProject] = useState<Project | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [currentBudget, setCurrentBudget] = useState<Budget | null>(null);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 全体リロード: project + budget list + 選択中 budget の items を取り直す。
   * 楽観ロック衝突や成功時に呼ばれる。
   */
  const refresh = useCallback(
    async (preferBudgetId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const [projectRes, budgetsRes] = await Promise.all([
          getProject(projectId),
          listBudgets(projectId),
        ]);
        setProject(projectRes.project);
        setBudgets(budgetsRes.items);

        const pick =
          (preferBudgetId && budgetsRes.items.find((b) => b.id === preferBudgetId)) ||
          budgetsRes.items.find((b) => b.status === 'draft') ||
          budgetsRes.items[0] ||
          null;
        setCurrentBudget(pick);

        if (pick) {
          const tree = await listBudgetItems(projectId, pick.id);
          setItems(tree.items);
          // totalAmount は items 変更に追随したいので最新を再取得
          const fresh = await getBudget(projectId, pick.id);
          setCurrentBudget(fresh.budget);
        } else {
          setItems([]);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '予算データの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 1 件分の楽観的更新 (toast 後の手動リロードを待たず、PATCH 成功直後にローカル state を入替え)
  const handleItemUpdated = useCallback((updated: BudgetItem) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }, []);

  if (loading && !project) {
    return <p className="text-sm text-muted-foreground">読み込み中…</p>;
  }
  if (error) {
    return (
      <div className="space-y-3">
        <BackLink projectId={projectId} />
        <p className="rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      </div>
    );
  }
  if (!project) return <p>工事が見つかりません</p>;

  return (
    <div className="space-y-4">
      <BackLink projectId={projectId} />

      {currentBudget ? (
        <BudgetHeaderEditor
          project={project}
          budget={currentBudget}
          projectId={projectId}
          editable={currentBudget.status === 'draft'}
          onRefresh={() => refresh(currentBudget.id)}
        />
      ) : (
        <h1 className="text-2xl font-semibold">
          <span className="mr-3 font-mono text-base text-muted-foreground">{project.code}</span>
          実行予算
        </h1>
      )}

      {budgets.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">version:</span>
          {budgets.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => void refresh(b.id)}
              className={
                'rounded-md border px-2 py-1 ' +
                (b.id === currentBudget?.id
                  ? 'border-foreground bg-muted font-medium'
                  : 'border-border hover:bg-muted')
              }
            >
              v{b.version} ({b.status})
            </button>
          ))}
        </div>
      ) : null}

      {!currentBudget ? (
        <p className="rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
          この工事にはまだ予算が登録されていません。
        </p>
      ) : (
        <BudgetTreeTable
          projectId={projectId}
          budgetId={currentBudget.id}
          items={items}
          onRefresh={() => refresh(currentBudget.id)}
          onItemUpdated={handleItemUpdated}
          editable={currentBudget.status === 'draft'}
        />
      )}

      {currentBudget && currentBudget.status !== 'draft' ? (
        <p className="text-xs text-muted-foreground">
          ※ status が <code className="font-mono">{currentBudget.status}</code>{' '}
          のため、明細の編集は無効化されています。
        </p>
      ) : null}
    </div>
  );
}

function BackLink({ projectId }: { projectId: string }): React.ReactElement {
  return (
    <Link
      href={`/admin/projects/${projectId}`}
      className="text-sm text-muted-foreground hover:underline"
    >
      ← 工事詳細に戻る
    </Link>
  );
}
