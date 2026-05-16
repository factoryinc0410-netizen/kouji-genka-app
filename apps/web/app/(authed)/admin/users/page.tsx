'use client';

import type { PublicUser } from '@kgk/schemas';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import { deleteUser, listUsers } from '@/lib/api/users';
import { CreateUserDialog } from './CreateUserDialog';

export default function AdminUsersPage(): React.ReactElement {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listUsers({ limit: 200 });
      setUsers(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ユーザ一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleDelete(id: string): Promise<void> {
    if (!confirm('このユーザを論理削除します。よろしいですか?')) return;
    try {
      await deleteUser(id);
      await refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '削除に失敗しました');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ユーザ管理</h1>
        <Button onClick={() => setDialogOpen(true)}>新規作成</Button>
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
              <th className="px-4 py-2 font-medium">メール</th>
              <th className="px-4 py-2 font-medium">氏名</th>
              <th className="px-4 py-2 font-medium">ロール</th>
              <th className="px-4 py-2 font-medium">状態</th>
              <th className="px-4 py-2 font-medium">最終ログイン</th>
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
            ) : users.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={6}>
                  ユーザが見つかりません
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{u.name}</td>
                  <td className="px-4 py-2">{u.role.name}</td>
                  <td className="px-4 py-2">
                    {u.isActive ? (
                      <span className="text-foreground">有効</span>
                    ) : (
                      <span className="text-muted-foreground">無効</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ja-JP') : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(u.id)}
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

      <CreateUserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => {
          setDialogOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}
