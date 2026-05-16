'use client';

import type { Project } from '@kgk/schemas';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { listProjects } from '@/lib/api/projects';
import { formatAmount } from '@/lib/format';
import { CONSTRUCTION_TYPE_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '@/lib/labels';

/**
 * 全ロール用の工事一覧。
 * API 側 (ProjectAccessService.whereForView) で
 * - admin / accounting → 全件
 * - planner / field / viewer → manager 本人 or UPP がある工事
 * に自動で絞り込まれるため、ここで追加の認可は不要。
 */
export default function ProjectsPage(): React.ReactElement {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listProjects({ limit: 200 });
      setProjects(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '工事一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">工事一覧</h1>

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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={6}>
                  読み込み中…
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={6}>
                  閲覧可能な工事がありません
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
