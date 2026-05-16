import { z } from 'zod';
import { RoleCodeSchema } from './auth';

/**
 * UserProjectPermission (UPP): 工事 × ユーザの権限。
 * - 一覧/レスポンスでは user の最小情報 (id, email, name, role) を含めて返す
 *   (画面で氏名表示・ロール確認するため)。
 * - admin は権限付与の動作対象外 (ABAC で常時 bypass) だが、API レイヤは中立を保ち
 *   admin/accounting への付与もブロックしない。UI 側で必要に応じて警告する。
 */

export const ProjectPermissionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  isActive: z.boolean(),
  role: z.object({
    code: RoleCodeSchema,
    name: z.string(),
  }),
});
export type ProjectPermissionUser = z.infer<typeof ProjectPermissionUserSchema>;

export const ProjectPermissionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  projectId: z.string().uuid(),
  canView: z.boolean(),
  canEdit: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  user: ProjectPermissionUserSchema,
});
export type ProjectPermission = z.infer<typeof ProjectPermissionSchema>;

export const GrantProjectPermissionRequestSchema = z.object({
  userId: z.string().uuid(),
  canView: z.boolean().optional(),
  canEdit: z.boolean().optional(),
});
export type GrantProjectPermissionRequest = z.infer<typeof GrantProjectPermissionRequestSchema>;

export const UpdateProjectPermissionRequestSchema = z
  .object({
    canView: z.boolean().optional(),
    canEdit: z.boolean().optional(),
  })
  .refine((v) => v.canView !== undefined || v.canEdit !== undefined, {
    message: 'canView または canEdit のいずれかを指定してください',
  });
export type UpdateProjectPermissionRequest = z.infer<typeof UpdateProjectPermissionRequestSchema>;

export const ListProjectPermissionsResponseSchema = z.object({
  items: z.array(ProjectPermissionSchema),
  total: z.number().int().nonnegative(),
});
export type ListProjectPermissionsResponse = z.infer<typeof ListProjectPermissionsResponseSchema>;

export const ProjectPermissionResponseSchema = z.object({ permission: ProjectPermissionSchema });
export type ProjectPermissionResponse = z.infer<typeof ProjectPermissionResponseSchema>;
