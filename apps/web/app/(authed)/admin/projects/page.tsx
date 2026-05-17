'use client';

import { PROJECT_STATUSES, type Project, type ProjectStatus } from '@kgk/schemas';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import { deleteProject, listProjects } from '@/lib/api/projects';
import { formatAmount } from '@/lib/format';
import { CONSTRUCTION_TYPE_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '@/lib/labels';
import { ProjectFormDialog } from './ProjectFormDialog';

function isProjectStatus(v: string | null): v is ProjectStatus {
  return v !== null && (PROJECT_STATUSES as readonly string[]).includes(v);
}

/**
 * T35: useSearchParams を使う子コンポーネントを Suspense でラップしておく
 * (Next 15 で client component + static route の組合せでビルドが落ちる回避)。
 */
export default function AdminProjectsPage(): React.ReactElement {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">読み込み中…</p>}>
      <AdminProjectsPageInner />
    </Suspense>
  );
}

function AdminProjectsPageInner(): React.ReactElement {
  const searchParams = useSearchParams();
  // T35: ダッシュボードのステータスカードから `?status=...` でフィルタ可能。
  const statusFilter = searchParams.get('status');
  const status = isProjectStatus(statusFilter) ? statusFilter : undefined;

  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listProjects({ limit: 200, status });
      setProjects(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '工事一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleDelete(p: Project): Promise<void> {
    if (!confirm(`「${p.code} ${p.name}」を論理削除します。よろしいですか?`)) return;
    try {
      await deleteProject(p.id);
      await refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '削除に失敗しました');
    }
  }

  function openCreate(): void {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(p: Project): void {
    setEditing(p);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">工事管理</h1>
        <Button onClick={openCreate}>新規作成</Button>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">工事番号</th>
              <th className="px-4 py-2 font-medium">件名</th>
              <th className="px-4 py-2 font-medium">区分</th>
              <th className="px-4 py-2 font-medium">構造</th>
              <th className="px-4 py-2 font-medium">ステータス</th>
              <th className="px-4 py-2 text-right font-medium">請負金額 (円)</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={7}>
                  読み込み中…
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={7}>
                  工事が見つかりません
                </td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{PROJECT_TYPE_LABELS[p.projectType]}</td>
                  <td className="px-4 py-2">{CONSTRUCTION_TYPE_LABELS[p.constructionType]}</td>
                  <td className="px-4 py-2">{PROJECT_STATUS_LABELS[p.status]}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatAmount(p.contractAmount)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="inline-flex h-8 items-center rounded-md px-3 text-sm hover:bg-muted"
                    >
                      詳細
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      編集
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(p)}
                      className="text-destructive"
                    >
                      削除
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ProjectFormDialog
        open={dialogOpen}
        mode={editing ? 'edit' : 'create'}
        initial={editing ?? undefined}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        onSaved={() => {
          setDialogOpen(false);
          setEditing(null);
          void refresh();
        }}
      />
    </div>
  );
}
