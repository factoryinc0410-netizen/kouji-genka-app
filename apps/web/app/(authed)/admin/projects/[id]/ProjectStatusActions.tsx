'use client';

import {
  PROJECT_STATUS_BACKWARD_TRANSITIONS,
  PROJECT_STATUS_FORWARD_TRANSITIONS,
  type Project,
  type ProjectStatus,
} from '@kgk/schemas';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { me } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { updateProject } from '@/lib/api/projects';
import { PROJECT_STATUS_LABELS } from '@/lib/labels';
import { ProjectStatusTransitionDialog } from './ProjectStatusTransitionDialog';

/**
 * T34: 工事ステータス遷移ボタン群。
 *
 * - **forward** (PROJECT_STATUS_FORWARD_TRANSITIONS): 全 role に表示。reason 任意
 * - **backward** (PROJECT_STATUS_BACKWARD_TRANSITIONS): admin のみ表示。reason 必須
 * - クリックで ProjectStatusTransitionDialog を開き、確定で PATCH /projects/:id を叩く
 * - 409/422/403 のエラーコードをトーストで親切に説明
 *
 * 設計判断 F: Dropdown ではなく **専用ボタン群**。次のアクションが明確、誤操作を減らす。
 */

interface Props {
  project: Project;
  onRefresh: () => Promise<void> | void;
}

export function ProjectStatusActions({ project, onRefresh }: Props): React.ReactElement | null {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [dialogTo, setDialogTo] = useState<ProjectStatus | null>(null);
  const [dialogDirection, setDialogDirection] = useState<'forward' | 'backward'>('forward');

  // 後戻り (backward) ボタンの表示は admin 限定。サーバ側でも検証されるが UX 整え目的。
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    me()
      .then((res) => setIsAdmin(res.user.role.code === 'admin'))
      .catch(() => setIsAdmin(false));
  }, []);

  const handleConfirm = useCallback(
    async (reason: string | undefined): Promise<void> => {
      if (!dialogTo) return;
      setPending(true);
      try {
        await updateProject(project.id, { status: dialogTo, statusReason: reason });
        toast.show({
          kind: 'success',
          title: `${PROJECT_STATUS_LABELS[dialogTo]} に変更しました`,
        });
        setDialogTo(null);
        await onRefresh();
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.code === 'INVALID_PROJECT_STATUS_TRANSITION') {
            toast.show({
              kind: 'warning',
              title: '許可されていない遷移です',
              description: err.message,
            });
          } else if (err.code === 'PROJECT_STATUS_REASON_REQUIRED') {
            toast.show({
              kind: 'warning',
              title: '差戻しには理由が必要です',
              description: err.message,
            });
          } else if (err.code === 'PROJECT_BACKWARD_FORBIDDEN') {
            toast.show({
              kind: 'error',
              title: '権限がありません',
              description: '差戻しは管理者のみが行えます。',
            });
          } else {
            toast.show({
              kind: 'error',
              title: 'ステータス変更に失敗しました',
              description: err.message,
            });
          }
        } else {
          toast.show({ kind: 'error', title: '不明なエラー' });
        }
      } finally {
        setPending(false);
      }
    },
    [dialogTo, project.id, toast, onRefresh],
  );

  const openDialog = (to: ProjectStatus, direction: 'forward' | 'backward'): void => {
    setDialogDirection(direction);
    setDialogTo(to);
  };

  const forwardTargets = PROJECT_STATUS_FORWARD_TRANSITIONS[project.status];
  const backwardTargets = isAdmin ? PROJECT_STATUS_BACKWARD_TRANSITIONS[project.status] : [];

  if (forwardTargets.length === 0 && backwardTargets.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" data-testid="project-status-actions">
        {forwardTargets.map((to) => (
          <Button
            key={`fwd-${to}`}
            size="sm"
            data-testid="project-status-forward-btn"
            data-to={to}
            onClick={() => openDialog(to, 'forward')}
            disabled={pending}
          >
            {forwardLabel(project.status, to)}
          </Button>
        ))}
        {backwardTargets.map((to) => (
          <Button
            key={`back-${to}`}
            size="sm"
            variant="outline"
            data-testid="project-status-backward-btn"
            data-to={to}
            onClick={() => openDialog(to, 'backward')}
            disabled={pending}
          >
            {PROJECT_STATUS_LABELS[to]} に戻す
          </Button>
        ))}
      </div>

      {dialogTo ? (
        <ProjectStatusTransitionDialog
          open={dialogTo !== null}
          onOpenChange={(o) => !o && setDialogTo(null)}
          from={project.status}
          to={dialogTo}
          direction={dialogDirection}
          pending={pending}
          onConfirm={handleConfirm}
        />
      ) : null}
    </>
  );
}

/** forward ボタンのラベル: 文脈に合った日本語動詞を選ぶ */
function forwardLabel(from: ProjectStatus, to: ProjectStatus): string {
  if (from === 'bidding' && to === 'in_progress') return '受注 → 着工';
  if (from === 'in_progress' && to === 'completed') return '竣工としてマーク';
  if (from === 'in_progress' && to === 'closed') return '中止 (closed)';
  if (from === 'completed' && to === 'billing') return '請求を開始';
  if (from === 'billing' && to === 'closed') return '請求完了 → クローズ';
  // フォールバック (将来 enum 追加されても壊れない)
  return `${PROJECT_STATUS_LABELS[to]} に進める`;
}
