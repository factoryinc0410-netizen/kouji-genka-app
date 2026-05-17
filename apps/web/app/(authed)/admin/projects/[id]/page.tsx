'use client';

import type { Customer, Project, PublicUser } from '@kgk/schemas';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ProjectStatusBadge } from '@/components/ui/project-status-badge';
import { ApiError } from '@/lib/api/client';
import { listCustomers } from '@/lib/api/customers';
import { getProject } from '@/lib/api/projects';
import { listUsers } from '@/lib/api/users';
import { formatAmount } from '@/lib/format';
import { CONSTRUCTION_TYPE_LABELS, PROJECT_TYPE_LABELS } from '@/lib/labels';
import { PermissionsSection } from './PermissionsSection';
import { ProjectStatusActions } from './ProjectStatusActions';
import { ProjectStatusHistoryDrawer } from './ProjectStatusHistoryDrawer';

/**
 * 工事詳細ページ (admin 専用)。
 * - 基本情報の表示 (read-only。編集は /admin/projects 一覧のダイアログ経由)
 * - メンバー (UPP) の付与 / 更新 / 削除
 */
export default function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(params);

  const [project, setProject] = useState<Project | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [manager, setManager] = useState<PublicUser | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectRes, customersRes, usersRes] = await Promise.all([
        getProject(id),
        listCustomers({ limit: 200 }),
        listUsers({ limit: 200 }),
      ]);
      const p = projectRes.project;
      setProject(p);
      setUsers(usersRes.items);
      setCustomer(customersRes.items.find((c) => c.id === p.customerId) ?? null);
      setManager(
        p.managerUserId ? (usersRes.items.find((u) => u.id === p.managerUserId) ?? null) : null,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '工事詳細の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">読み込み中…</p>;
  }
  if (error) {
    return (
      <div className="space-y-3">
        <Link href="/admin/projects" className="text-sm text-muted-foreground hover:underline">
          ← 工事管理に戻る
        </Link>
        <p className="rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      </div>
    );
  }
  if (!project) return <p>工事が見つかりません</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/projects" className="text-sm text-muted-foreground hover:underline">
          ← 工事管理に戻る
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">
              <span className="mr-3 font-mono text-base text-muted-foreground">{project.code}</span>
              {project.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ProjectStatusBadge status={project.status} />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setHistoryOpen(true)}
                data-testid="project-status-history-button"
                aria-label="ステータス変遷履歴"
              >
                履歴
              </Button>
              <ProjectStatusActions project={project} onRefresh={refresh} />
            </div>
          </div>
          <Link
            href={`/admin/projects/${project.id}/budget`}
            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-muted"
          >
            実行予算を開く →
          </Link>
        </div>
      </div>

      <ProjectStatusHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        projectId={project.id}
      />

      <section className="rounded-md border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">基本情報</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="取引先">{customer ? `${customer.code} — ${customer.name}` : '—'}</Field>
          <Field label="ステータス">
            <ProjectStatusBadge status={project.status} size="xs" />
          </Field>
          <Field label="工事区分">{PROJECT_TYPE_LABELS[project.projectType]}</Field>
          <Field label="構造種別">{CONSTRUCTION_TYPE_LABELS[project.constructionType]}</Field>
          <Field label="着工日">{project.startDate ?? '—'}</Field>
          <Field label="竣工予定日">{project.endDate ?? '—'}</Field>
          <Field label="実竣工日">{project.actualEndDate ?? '—'}</Field>
          <Field label="請負金額 (円)">
            <span className="tabular-nums">{formatAmount(project.contractAmount)}</span>
          </Field>
          <Field label="現場代理人">{manager ? `${manager.name} (${manager.email})` : '—'}</Field>
          <Field label="所在地">{project.location ?? '—'}</Field>
          <div className="col-span-2">
            <Field label="備考">{project.notes ?? '—'}</Field>
          </div>
        </dl>
      </section>

      <PermissionsSection projectId={project.id} allUsers={users} />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}
