'use client';

import type { ProjectPermission, PublicUser, RoleCode } from '@kgk/schemas';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import {
  listProjectPermissions,
  revokeProjectPermission,
  updateProjectPermission,
} from '@/lib/api/project-permissions';
import { GrantPermissionDialog } from './GrantPermissionDialog';

interface Props {
  projectId: string;
  /** 付与候補のユーザ一覧 (admin が既に listUsers で取得済み) */
  allUsers: PublicUser[];
}

/** 「全工事を素通しで閲覧できる」ロール = UPP は実質無効 */
const BYPASS_ROLES: ReadonlyArray<RoleCode> = ['admin', 'accounting'];

function isBypassRole(code: RoleCode): boolean {
  return BYPASS_ROLES.includes(code);
}

const BYPASS_WARN = 'このロールは元々全工事の閲覧権限を持っています (UPP は実質無効)';

export function PermissionsSection({ projectId, allUsers }: Props): React.ReactElement {
  const [items, setItems] = useState<ProjectPermission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listProjectPermissions(projectId);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'メンバー一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 楽観的更新: 先にローカル state を入れ替え → PATCH 結果で確定。失敗時は元に戻して alert
  async function toggleFlag(
    upp: ProjectPermission,
    field: 'canView' | 'canEdit',
    next: boolean,
  ): Promise<void> {
    const previous = items;
    setItems((prev) => prev.map((p) => (p.id === upp.id ? { ...p, [field]: next } : p)));
    try {
      const res = await updateProjectPermission(projectId, upp.userId, { [field]: next });
      setItems((prev) => prev.map((p) => (p.id === res.permission.id ? res.permission : p)));
    } catch (err) {
      setItems(previous); // ロールバック
      alert(err instanceof ApiError ? err.message : '権限の更新に失敗しました');
    }
  }

  async function handleRevoke(upp: ProjectPermission): Promise<void> {
    if (!confirm(`${upp.user.name} の権限を解除します。よろしいですか?`)) return;
    const previous = items;
    setItems((prev) => prev.filter((p) => p.id !== upp.id));
    try {
      await revokeProjectPermission(projectId, upp.userId);
    } catch (err) {
      setItems(previous);
      alert(err instanceof ApiError ? err.message : '権限の解除に失敗しました');
    }
  }

  // ダイアログの候補: まだ UPP がなく、active なユーザのみ
  const assignedIds = new Set(items.map((p) => p.userId));
  const candidateUsers = allUsers.filter((u) => u.isActive && !assignedIds.has(u.id));

  return (
    <section className="rounded-md border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">メンバー (UPP)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            planner / field / viewer のユーザは、ここに登録された工事のみを閲覧・編集できます。
            admin と accounting は全工事を素通しで閲覧できます。
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} disabled={candidateUsers.length === 0}>
          メンバーを追加
        </Button>
      </div>

      {error ? (
        <p className="mb-3 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">氏名</th>
              <th className="px-4 py-2 font-medium">メール</th>
              <th className="px-4 py-2 font-medium">ロール</th>
              <th className="px-4 py-2 text-center font-medium">閲覧</th>
              <th className="px-4 py-2 text-center font-medium">編集</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={6}>
                  読み込み中…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={6}>
                  メンバーがいません
                </td>
              </tr>
            ) : (
              items.map((upp) => {
                const bypass = isBypassRole(upp.user.role.code);
                return (
                  <tr key={upp.id} className="border-t">
                    <td className="px-4 py-2">
                      <div>{upp.user.name}</div>
                      {bypass ? (
                        <div
                          className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400"
                          role="note"
                          title={BYPASS_WARN}
                        >
                          ⚠ {BYPASS_WARN}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{upp.user.email}</td>
                    <td className="px-4 py-2">{upp.user.role.name}</td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${upp.user.name} の閲覧権限`}
                        className="h-4 w-4 cursor-pointer rounded border-input"
                        checked={upp.canView}
                        onChange={(e) => void toggleFlag(upp, 'canView', e.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${upp.user.name} の編集権限`}
                        className="h-4 w-4 cursor-pointer rounded border-input"
                        checked={upp.canEdit}
                        onChange={(e) => void toggleFlag(upp, 'canEdit', e.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(upp)}
                        className="text-destructive"
                      >
                        解除
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <GrantPermissionDialog
        open={dialogOpen}
        projectId={projectId}
        candidates={candidateUsers}
        onOpenChange={setDialogOpen}
        onGranted={() => {
          setDialogOpen(false);
          void refresh();
        }}
      />
    </section>
  );
}
