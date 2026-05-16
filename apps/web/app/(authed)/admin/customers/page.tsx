'use client';

import type { Customer } from '@kgk/schemas';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import { deleteCustomer, listCustomers } from '@/lib/api/customers';
import { CUSTOMER_TYPE_LABELS } from '@/lib/labels';
import { CustomerFormDialog } from './CustomerFormDialog';

export default function AdminCustomersPage(): React.ReactElement {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCustomers({ limit: 200 });
      setCustomers(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '取引先一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleDelete(c: Customer): Promise<void> {
    if (!confirm(`「${c.code} ${c.name}」を論理削除します。よろしいですか?`)) return;
    try {
      await deleteCustomer(c.id);
      await refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '削除に失敗しました');
    }
  }

  function openCreate(): void {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(c: Customer): void {
    setEditing(c);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">取引先管理</h1>
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
              <th className="px-4 py-2 font-medium">コード</th>
              <th className="px-4 py-2 font-medium">名称</th>
              <th className="px-4 py-2 font-medium">区分</th>
              <th className="px-4 py-2 font-medium">担当者</th>
              <th className="px-4 py-2 font-medium">電話</th>
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
            ) : customers.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={6}>
                  取引先が見つかりません
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">{c.code}</td>
                  <td className="px-4 py-2">
                    <div>{c.name}</div>
                    {c.nameKana ? (
                      <div className="text-xs text-muted-foreground">{c.nameKana}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">{CUSTOMER_TYPE_LABELS[c.customerType]}</td>
                  <td className="px-4 py-2">{c.contactPerson ?? '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.phone ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                      編集
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(c)}
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

      <CustomerFormDialog
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
