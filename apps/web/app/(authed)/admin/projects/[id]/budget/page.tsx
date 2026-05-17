'use client';

import type { Budget, BudgetItem, Project } from '@kgk/schemas';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { getBudget, listBudgetItems, listBudgets } from '@/lib/api/budgets';
import { ApiError } from '@/lib/api/client';
import { getProject } from '@/lib/api/projects';
import { BudgetHeaderEditor } from './BudgetHeaderEditor';
import { BudgetTreeTable } from './BudgetTreeTable';

/**
 * 工事 × 予算ページ (admin).
 *
 * 初期表示の優先順位 (T37):
 *   1. URL クエリ `?v=<budgetId>` が指定されていて、その id が budgets に存在
 *   2. status=draft の最新版
 *   3. budgets[0] (= 最新 version)
 *
 * バージョン切替は BudgetHeaderEditor 内の BudgetVersionSwitcher (dropdown) から行い (T31)、
 * 切替えた瞬間に `window.history.replaceState` で URL の `?v=` を書き換える (shallow:
 * RSC payload を再フェッチしない / Next の loading.tsx を発火させない / 履歴は積まない)。
 */
export default function ProjectBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id: projectId } = use(params);
  const searchParams = useSearchParams();
  /**
   * 初回マウント時のみ参照する URL クエリ。以降の `?v=` 書換は
   * window.history.replaceState で行うため、useSearchParams は更新を観測しない
   * (これは意図通り — 副作用ループを避ける)。
   */
  const initialUrlBudgetId = useRef<string | null>(searchParams.get('v'));

  const [project, setProject] = useState<Project | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [currentBudget, setCurrentBudget] = useState<Budget | null>(null);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 全体リロード: project + budget list + 選択中 budget の items を取り直す。
   * 楽観ロック衝突や成功時、バージョン切替時に呼ばれる。
   *
   * pick が確定したら URL の `?v=` を pick.id に同期する (shallow)。指定された
   * preferBudgetId が budgets に存在しなければ stale とみなし、pick (= デフォルト
   * 選定結果) で URL を矯正する。
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
        syncUrl(pick?.id ?? null);

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
    void refresh(initialUrlBudgetId.current ?? undefined);
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
          budgets={budgets}
          onRefresh={() => refresh(currentBudget.id)}
          onSwitchBudget={(newId) => refresh(newId)}
        />
      ) : (
        <h1 className="text-2xl font-semibold">
          <span className="mr-3 font-mono text-base text-muted-foreground">{project.code}</span>
          実行予算
        </h1>
      )}

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

/**
 * URL クエリ `?v=<budgetId>` を shallow に書換える (T37)。
 *
 * - `window.history.replaceState` を使い、Next の router を介さない
 *   → RSC payload 再フェッチも layout の loading.tsx 発火もしない
 * - 履歴も積まない (replace) ので、戻るボタンで「同ページの別版」が並ばない
 * - id が null の場合は `?v=` を削除 (budgets が空のとき)
 */
function syncUrl(budgetId: string | null): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const current = url.searchParams.get('v');
  if (budgetId) {
    if (current === budgetId) return;
    url.searchParams.set('v', budgetId);
  } else {
    if (current === null) return;
    url.searchParams.delete('v');
  }
  window.history.replaceState(window.history.state, '', url.toString());
}
