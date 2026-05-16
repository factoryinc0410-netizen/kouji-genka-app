import { z } from 'zod';

/**
 * Budget / BudgetItem の DTO (Zod)。
 *
 * 金額・数量の文字列ルール:
 * - 数量 (quantity):  ^\d+(\.\d{1,4})?$    (整数 or 小数 4 桁まで、numeric(15,4) と整合)
 * - 単価 (unitPrice): ^\d+$                (整数のみ、numeric(15,0))
 * - 金額 (amount/totalAmount): API では「読取専用 string」。クライアントから直接渡されない。
 *
 * すべて精度ロス防止のため number 禁止 / string 必須。
 */

const QuantityStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/, '数量は 0 以上、小数 4 桁以内の数字を文字列で指定してください')
  .max(20);

const UnitPriceStringSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, '単価は 0 以上の整数を文字列で指定してください')
  .max(15);

export const BUDGET_STATUSES = ['draft', 'pending_approval', 'approved', 'superseded'] as const;
export const BudgetStatusSchema = z.enum(BUDGET_STATUSES);
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

export const BUDGET_ITEM_KINDS = ['section', 'detail', 'composite'] as const;
export const BudgetItemKindSchema = z.enum(BUDGET_ITEM_KINDS);
export type BudgetItemKind = z.infer<typeof BudgetItemKindSchema>;

export const COST_ELEMENTS = ['labor', 'material', 'subcontract', 'machine', 'expense'] as const;
export const CostElementSchema = z.enum(COST_ELEMENTS);
export type CostElement = z.infer<typeof CostElementSchema>;

// ===================================================================
// Budget (header)
// ===================================================================

export const BudgetSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  version: z.number().int().positive(),
  status: BudgetStatusSchema,
  title: z.string().nullable(),
  /** numeric(15,0)。精度ロス防止のため string */
  totalAmount: z.string(),
  submittedById: z.string().uuid().nullable(),
  submittedAt: z.string().datetime().nullable(),
  approvedById: z.string().uuid().nullable(),
  approvedAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  /** 楽観ロック (UPDATE 毎に +1)。Update リクエストでは現在値を必ず返送する */
  lockVersion: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const CreateBudgetRequestSchema = z.object({
  /** 任意。未指定なら同 project の max(version)+1 が自動付与される */
  version: z.number().int().positive().optional(),
  title: z.string().trim().max(200).optional(),
  status: BudgetStatusSchema.optional(),
  notes: z.string().trim().max(5000).optional(),
});
export type CreateBudgetRequest = z.infer<typeof CreateBudgetRequestSchema>;

export const UpdateBudgetRequestSchema = z
  .object({
    /** 楽観ロック: 必ず現状の lockVersion を返送すること */
    lockVersion: z.number().int().nonnegative(),
    title: z.string().trim().max(200).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((v) => Object.entries(v).some(([k, x]) => k !== 'lockVersion' && x !== undefined), {
    message: '少なくとも 1 つの更新フィールドを指定してください',
  });
export type UpdateBudgetRequest = z.infer<typeof UpdateBudgetRequestSchema>;

// ===================================================================
// Workflow (T26): 申請 / 承認 / 差戻し / 改定
// status 遷移は通常編集 (PATCH) と分離した専用 endpoint で扱う。
// ===================================================================

/** POST /budgets/:id/submit  (draft → pending_approval) */
export const SubmitBudgetRequestSchema = z.object({
  lockVersion: z.number().int().nonnegative(),
});
export type SubmitBudgetRequest = z.infer<typeof SubmitBudgetRequestSchema>;

/** POST /budgets/:id/approve  (pending_approval → approved) */
export const ApproveBudgetRequestSchema = z.object({
  lockVersion: z.number().int().nonnegative(),
});
export type ApproveBudgetRequest = z.infer<typeof ApproveBudgetRequestSchema>;

/**
 * POST /budgets/:id/reject  (pending_approval → draft)
 * - comment: 差戻し理由 (任意、audit log の after.reason に保存)
 */
export const RejectBudgetRequestSchema = z.object({
  lockVersion: z.number().int().nonnegative(),
  comment: z.string().trim().max(1000).optional(),
});
export type RejectBudgetRequest = z.infer<typeof RejectBudgetRequestSchema>;

/**
 * POST /budgets/:id/revise  (approved → superseded + 新 draft v+1)
 * 成功時のレスポンスは新 draft 予算 ({ budget }) を返す。
 */
export const ReviseBudgetRequestSchema = z.object({
  lockVersion: z.number().int().nonnegative(),
});
export type ReviseBudgetRequest = z.infer<typeof ReviseBudgetRequestSchema>;

export const ListBudgetsResponseSchema = z.object({
  items: z.array(BudgetSchema),
  total: z.number().int().nonnegative(),
});
export type ListBudgetsResponse = z.infer<typeof ListBudgetsResponseSchema>;

export const BudgetResponseSchema = z.object({ budget: BudgetSchema });
export type BudgetResponse = z.infer<typeof BudgetResponseSchema>;

// ===================================================================
// BudgetItem
// ===================================================================

export const BudgetItemSchema = z.object({
  id: z.string().uuid(),
  budgetId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  level: z.number().int().nonnegative(),
  displayOrder: z.number().int().nonnegative(),
  kind: BudgetItemKindSchema,
  code: z.string().nullable(),
  name: z.string(),
  spec: z.string().nullable(),
  unit: z.string().nullable(),
  costElement: CostElementSchema.nullable(),
  /** numeric(15,4) を string で */
  quantity: z.string(),
  /** numeric(15,0) を string で */
  unitPrice: z.string(),
  /** numeric(15,0) を string で。葉=quantity*unitPrice / 節点=子合計 (再計算済) */
  amount: z.string(),
  notes: z.string().nullable(),
  lockVersion: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BudgetItem = z.infer<typeof BudgetItemSchema>;

export const CreateBudgetItemRequestSchema = z.object({
  /** null/undefined ならツリー root */
  parentId: z.string().uuid().optional(),
  /** 同一 parent 内の並び順。未指定なら兄弟最大 + 1000 */
  displayOrder: z.number().int().nonnegative().optional(),
  kind: BudgetItemKindSchema,
  code: z.string().trim().max(50).optional(),
  name: z.string().trim().min(1).max(200),
  spec: z.string().trim().max(2000).optional(),
  unit: z.string().trim().max(20).optional(),
  costElement: CostElementSchema.optional(),
  quantity: QuantityStringSchema.optional(),
  unitPrice: UnitPriceStringSchema.optional(),
  notes: z.string().trim().max(5000).optional(),
});
export type CreateBudgetItemRequest = z.infer<typeof CreateBudgetItemRequestSchema>;

export const UpdateBudgetItemRequestSchema = z
  .object({
    /** 楽観ロック: 必ず現状の lockVersion を返送すること */
    lockVersion: z.number().int().nonnegative(),
    /** 並び順 (同一 parent 内、または親付け替え時のドロップ位置) */
    displayOrder: z.number().int().nonnegative().optional(),
    /**
     * 親付け替え (Tree move):
     * - string (UUID): 指定 parent (section/composite) の下に移動
     * - null:          ルートに移動 (level=0)
     * - undefined:     親変更しない
     * level は API 側で新親に応じて再計算され、子孫の level も連鎖更新される。
     */
    parentId: z.string().uuid().nullable().optional(),
    code: z.string().trim().max(50).nullable().optional(),
    name: z.string().trim().min(1).max(200).optional(),
    spec: z.string().trim().max(2000).nullable().optional(),
    unit: z.string().trim().max(20).nullable().optional(),
    costElement: CostElementSchema.nullable().optional(),
    quantity: QuantityStringSchema.optional(),
    unitPrice: UnitPriceStringSchema.optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((v) => Object.entries(v).some(([k, x]) => k !== 'lockVersion' && x !== undefined), {
    message: '少なくとも 1 つの更新フィールドを指定してください',
  });
export type UpdateBudgetItemRequest = z.infer<typeof UpdateBudgetItemRequestSchema>;

export const DeleteBudgetItemRequestSchema = z.object({
  lockVersion: z.coerce.number().int().nonnegative(),
});
export type DeleteBudgetItemRequest = z.infer<typeof DeleteBudgetItemRequestSchema>;

export const BudgetItemTreeResponseSchema = z.object({
  items: z.array(BudgetItemSchema),
  total: z.number().int().nonnegative(),
});
export type BudgetItemTreeResponse = z.infer<typeof BudgetItemTreeResponseSchema>;

export const BudgetItemResponseSchema = z.object({ item: BudgetItemSchema });
export type BudgetItemResponse = z.infer<typeof BudgetItemResponseSchema>;
