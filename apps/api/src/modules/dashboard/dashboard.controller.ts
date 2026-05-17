import type { DashboardSummary } from '@kgk/schemas';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { DashboardService } from './dashboard.service';

/**
 * T35: 経営・管理ダッシュボード。
 *
 * - 認証必須 (AuthGuard)。役割によらず誰でも呼べるが、レスポンスは ABAC で
 *   絞り込まれる (admin = 全件、planner/field = manager本人 + UPP のみ)
 * - 「承認待ち管制塔」も admin = 可視全工事 / 非 admin = 自分が submitter で
 *   分岐するが、その判定は Service 側で行う
 */
@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  async summary(@CurrentUserId() actorId: string): Promise<DashboardSummary> {
    return this.dashboard.getSummary(actorId);
  }
}
