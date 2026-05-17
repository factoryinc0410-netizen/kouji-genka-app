import { z } from 'zod';

export const PROJECT_STATUSES = [
  'bidding',
  'in_progress',
  'completed',
  'billing',
  'closed',
] as const;
export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

// =====================================================================
// T34: 工事ステータス遷移ルール
//
// 設計判断 (詳細はチケット T34 計画書):
// - forward: 通常運用の前進 (受注 → 着工 → 完工 → 請求 → 完了)
// - backward: 差戻し / 取消 (admin 限定 + reason 必須、Service 層で強制)
// - 2 段飛ばし禁止: forward のリストに連続性を埋め込む
// - 配下 budget の編集可否は action 別マトリクス (下記 3 つの Set)
// =====================================================================

/** 前進可能な遷移先 (admin 不要) */
export const PROJECT_STATUS_FORWARD_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  bidding: ['in_progress'],
  in_progress: ['completed', 'closed'],
  completed: ['billing'],
  billing: ['closed'],
  closed: [],
};

/** 後戻り遷移 — admin 限定 + statusReason 必須 (Service 層で強制) */
export const PROJECT_STATUS_BACKWARD_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> =
  {
    bidding: [],
    in_progress: ['bidding'],
    completed: ['in_progress'],
    billing: ['completed'],
    closed: ['billing', 'completed'],
  };

/**
 * 指定遷移が forward / backward のどちらか、あるいは禁止かを判定。
 * - 'forward':  通常運用、admin 不要
 * - 'backward': 後戻り、admin + reason 必須
 * - 'invalid':  2 段飛ばし等、完全に禁止
 * - 'noop':     from === to
 */
export function classifyProjectTransition(
  from: ProjectStatus,
  to: ProjectStatus,
): 'forward' | 'backward' | 'invalid' | 'noop' {
  if (from === to) return 'noop';
  if (PROJECT_STATUS_FORWARD_TRANSITIONS[from].includes(to)) return 'forward';
  if (PROJECT_STATUS_BACKWARD_TRANSITIONS[from].includes(to)) return 'backward';
  return 'invalid';
}

/**
 * 配下 budget の編集可否マトリクス (T34 設計判断 D)。
 *
 * | project.status | edit | workflow | revise |
 * |---|---|---|---|
 * | bidding        |  ○   |    ○     |   ○    |
 * | in_progress    |  ○   |    ○     |   ○    |
 * | completed      |  ✗   |    ○     |   ✗    |
 * | billing        |  ✗   |    ✗     |   ✗    |
 * | closed         |  ✗   |    ✗     |   ✗    |
 */
export const PROJECT_ALLOWS_BUDGET_EDIT: ReadonlySet<ProjectStatus> = new Set([
  'bidding',
  'in_progress',
]);
export const PROJECT_ALLOWS_BUDGET_WORKFLOW: ReadonlySet<ProjectStatus> = new Set([
  'bidding',
  'in_progress',
  'completed',
]);
export const PROJECT_ALLOWS_BUDGET_REVISE: ReadonlySet<ProjectStatus> = new Set([
  'bidding',
  'in_progress',
]);

export const PROJECT_TYPES = ['public', 'private'] as const;
export const ProjectTypeSchema = z.enum(PROJECT_TYPES);
export type ProjectType = z.infer<typeof ProjectTypeSchema>;

export const CONSTRUCTION_TYPES = ['civil', 'building', 'renovation'] as const;
export const ConstructionTypeSchema = z.enum(CONSTRUCTION_TYPES);
export type ConstructionType = z.infer<typeof ConstructionTypeSchema>;

/**
 * 請負金額は numeric(15,0) 円単位。
 * - レスポンスでは精度ロス回避のため必ず string で返す。
 * - リクエストは整数のみを許容する文字列で受け取る (小数点や符号、桁あふれを拒否)。
 */
const AmountStringSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, '請負金額は 0 以上の整数 (15 桁以内) を文字列で指定してください')
  .max(15);

/** Date (YYYY-MM-DD) 文字列 */
const DateOnlyStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で指定してください');

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  customerId: z.string().uuid(),
  location: z.string().nullable(),
  startDate: DateOnlyStringSchema.nullable(),
  endDate: DateOnlyStringSchema.nullable(),
  actualEndDate: DateOnlyStringSchema.nullable(),
  /** numeric(15,0) を精度ロスなく扱うため文字列 */
  contractAmount: z.string(),
  status: ProjectStatusSchema,
  projectType: ProjectTypeSchema,
  constructionType: ConstructionTypeSchema,
  managerUserId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectRequestSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  customerId: z.string().uuid(),
  location: z.string().trim().max(2000).optional(),
  startDate: DateOnlyStringSchema.optional(),
  endDate: DateOnlyStringSchema.optional(),
  actualEndDate: DateOnlyStringSchema.optional(),
  contractAmount: AmountStringSchema.optional(),
  status: ProjectStatusSchema.optional(),
  projectType: ProjectTypeSchema.optional(),
  constructionType: ConstructionTypeSchema.optional(),
  managerUserId: z.string().uuid().optional(),
  notes: z.string().trim().max(5000).optional(),
  /** status が指定された場合、status_history へ記録する理由 */
  statusReason: z.string().trim().max(500).optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const UpdateProjectRequestSchema = z
  .object({
    code: z.string().trim().min(1).max(50).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    customerId: z.string().uuid().optional(),
    location: z.string().trim().max(2000).nullable().optional(),
    startDate: DateOnlyStringSchema.nullable().optional(),
    endDate: DateOnlyStringSchema.nullable().optional(),
    actualEndDate: DateOnlyStringSchema.nullable().optional(),
    contractAmount: AmountStringSchema.optional(),
    status: ProjectStatusSchema.optional(),
    projectType: ProjectTypeSchema.optional(),
    constructionType: ConstructionTypeSchema.optional(),
    managerUserId: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    /**
     * status が変わる場合に履歴へ記録する理由。
     * - **forward 遷移**: 任意
     * - **backward 遷移** (後戻り): 必須 + admin 限定 (Service 層で強制)
     *   ※ before.status を input 単体では知れないため、schema 側では「statusReason
     *      指定時の最低 1 文字」のみ保証。真の backward 判定は ProjectsService 側。
     */
    statusReason: z.string().trim().max(500).optional(),
  })
  .refine((v) => Object.entries(v).some(([k, x]) => k !== 'statusReason' && x !== undefined), {
    message: '少なくとも 1 つのフィールドを指定してください',
  })
  .superRefine((v, ctx) => {
    // statusReason は status とセットで意味を持つ — status 未指定で reason だけ来たら弾く
    if (v.statusReason !== undefined && v.status === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['statusReason'],
        message: 'statusReason は status を変更する場合のみ指定できます',
      });
    }
    // 指定された statusReason が空白文字のみなら、未指定と区別できないため弾く
    // (Service 層の「backward なら reason 必須」検証を確実に発火させるため)
    if (v.statusReason !== undefined && v.statusReason.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['statusReason'],
        message: 'statusReason を空文字で送らないでください (省略するか、1 文字以上で指定)',
      });
    }
  });
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

export const ListProjectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** code / name への部分一致 (大文字小文字無視) */
  search: z.string().trim().max(255).optional(),
  status: ProjectStatusSchema.optional(),
  projectType: ProjectTypeSchema.optional(),
  constructionType: ConstructionTypeSchema.optional(),
  customerId: z.string().uuid().optional(),
  managerUserId: z.string().uuid().optional(),
});
export type ListProjectsQuery = z.infer<typeof ListProjectsQuerySchema>;

export const ListProjectsResponseSchema = z.object({
  items: z.array(ProjectSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
export type ListProjectsResponse = z.infer<typeof ListProjectsResponseSchema>;

export const ProjectResponseSchema = z.object({ project: ProjectSchema });
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

export const ProjectStatusHistoryEntrySchema = z.object({
  /** BigInt → string (精度ロス防止) */
  id: z.string(),
  projectId: z.string().uuid(),
  fromStatus: ProjectStatusSchema.nullable(),
  toStatus: ProjectStatusSchema,
  changedById: z.string().uuid(),
  changedAt: z.string().datetime(),
  reason: z.string().nullable(),
  /** 変更を行った user の name (削除済 / null 関係で取得不能なら null) */
  changedByName: z.string().nullable(),
});
export type ProjectStatusHistoryEntry = z.infer<typeof ProjectStatusHistoryEntrySchema>;

export const ProjectStatusHistoryResponseSchema = z.object({
  items: z.array(ProjectStatusHistoryEntrySchema),
  total: z.number().int().nonnegative(),
});
export type ProjectStatusHistoryResponse = z.infer<typeof ProjectStatusHistoryResponseSchema>;
