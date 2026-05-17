import { z } from 'zod';
import { ProjectStatusSchema } from './projects';

/**
 * T35: 経営・管理ダッシュボード DTO。
 *
 * - 金額は精度ロス防止のため必ず string で授受 (number 禁止)
 * - 予算カバレッジは **basis points 整数 string** で返却
 *   ("10000" = 100.00%、"12345" = 123.45%)
 * - アラートレベルは healthy / caution / warning / over の 4 段階 + unknown
 *   (budget なし / 請負金額 0 等で計算不能な場合)
 */

// ===================================================================
// 1) 工事ステータス分布 (5 status 必ず全部キーを持つ。0 件もパディング)
// ===================================================================

export const ProjectStatusCountsSchema = z.object({
  bidding: z.number().int().nonnegative(),
  in_progress: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  billing: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
});
export type ProjectStatusCounts = z.infer<typeof ProjectStatusCountsSchema>;

// ===================================================================
// 2) 承認待ち管制塔 (pending_approval の予算)
// ===================================================================

export const PendingApprovalItemSchema = z.object({
  budgetId: z.string().uuid(),
  projectId: z.string().uuid(),
  projectCode: z.string(),
  projectName: z.string(),
  version: z.number().int().positive(),
  /** numeric(15,0) を string で */
  totalAmount: z.string(),
  submittedById: z.string().uuid().nullable(),
  /** submitter が削除済 / 取得不能なら null */
  submittedByName: z.string().nullable(),
  submittedAt: z.string().datetime().nullable(),
  /**
   * 申請から現在までの経過秒。UI 側で「3 日経過」等を表示。
   * submittedAt が null なら 0 (異常データ防御)。
   */
  ageSeconds: z.number().int().nonnegative(),
});
export type PendingApprovalItem = z.infer<typeof PendingApprovalItemSchema>;

export const PendingApprovalAudienceSchema = z.enum(['admin', 'self']);
export type PendingApprovalAudience = z.infer<typeof PendingApprovalAudienceSchema>;

// ===================================================================
// 3) 予算カバレッジ (= 現行予算 / 請負金額)
//    出来高ベースの「実績消化率」は T38 で別実装予定。
// ===================================================================

export const COVERAGE_ALERT_LEVELS = [
  'healthy', // <80%
  'caution', // <95%
  'warning', // <100%
  'over', // >=100%
  'unknown', // contractAmount=0 or budget なし
] as const;
export const CoverageAlertLevelSchema = z.enum(COVERAGE_ALERT_LEVELS);
export type CoverageAlertLevel = z.infer<typeof CoverageAlertLevelSchema>;

export const BudgetCoverageItemSchema = z.object({
  projectId: z.string().uuid(),
  projectCode: z.string(),
  projectName: z.string(),
  projectStatus: ProjectStatusSchema,
  /** 請負金額 (string, numeric(15,0))、未設定なら "0" */
  contractAmount: z.string(),
  /** 「現行」予算 = approved or superseded のうち version 最大。なければ null */
  currentBudgetId: z.string().uuid().nullable(),
  currentBudgetTotal: z.string().nullable(),
  /**
   * カバレッジを basis points 整数文字列で返す。
   * - "10000" = 100.00%
   * - "12345" = 123.45%
   * - contractAmount=0 や budget なしなら null
   */
  coverageBps: z.string().nullable(),
  alertLevel: CoverageAlertLevelSchema,
});
export type BudgetCoverageItem = z.infer<typeof BudgetCoverageItemSchema>;

export const CoverageAlertCountsSchema = z.object({
  healthy: z.number().int().nonnegative(),
  caution: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
  over: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
});
export type CoverageAlertCounts = z.infer<typeof CoverageAlertCountsSchema>;

// ===================================================================
// 統合レスポンス
// ===================================================================

export const DashboardSummarySchema = z.object({
  projectStatusCounts: ProjectStatusCountsSchema,
  pendingApproval: z.object({
    /** admin: 可視全工事 / self: 自分が submitter のもの */
    audience: PendingApprovalAudienceSchema,
    /** 上限を超えて存在する場合は items の length より大きい値が入る */
    total: z.number().int().nonnegative(),
    /** 古い (submittedAt asc) 順、最大 10 件 */
    items: z.array(PendingApprovalItemSchema),
  }),
  budgetCoverage: z.object({
    /** worst (over → warning → caution → healthy → unknown) 順、最大 10 件 */
    items: z.array(BudgetCoverageItemSchema),
    /** 全件のアラートレベル別集計 */
    alertCounts: CoverageAlertCountsSchema,
  }),
  /** スナップショット生成時刻 (ISO 8601, TZ aware) */
  generatedAt: z.string().datetime(),
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
