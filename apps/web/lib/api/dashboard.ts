import type { DashboardSummary } from '@kgk/schemas';
import { apiFetch } from './client';

/**
 * T35: ダッシュボードサマリ取得 (1 round-trip)。
 * GET /dashboard/summary — 認証必須。ABAC は API 側で適用される。
 */
export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>('/dashboard/summary');
}
