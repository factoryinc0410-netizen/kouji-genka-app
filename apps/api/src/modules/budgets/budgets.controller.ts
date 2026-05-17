import {
  type ApproveBudgetRequest,
  ApproveBudgetRequestSchema,
  type CreateBudgetItemRequest,
  CreateBudgetItemRequestSchema,
  type CreateBudgetRequest,
  CreateBudgetRequestSchema,
  type DeleteBudgetItemRequest,
  DeleteBudgetItemRequestSchema,
  type RejectBudgetRequest,
  RejectBudgetRequestSchema,
  type ReviseBudgetRequest,
  ReviseBudgetRequestSchema,
  type SubmitBudgetRequest,
  SubmitBudgetRequestSchema,
  type UpdateBudgetItemRequest,
  UpdateBudgetItemRequestSchema,
  type UpdateBudgetRequest,
  UpdateBudgetRequestSchema,
} from '@kgk/schemas';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { RequireProjectAccess } from '../auth/project-access.decorator';
import { ProjectAccessGuard } from '../auth/project-access.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BudgetExportService } from './budget-export.service';
import { BudgetHistoryService } from './budget-history.service';
import { BudgetItemsService } from './budget-items.service';
import { BudgetsService } from './budgets.service';

function contextFromReq(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

/**
 * Budget ヘッダ CRUD。
 * URL: /api/v1/projects/:projectId/budgets[/...]
 *
 * ABAC: ProjectAccessGuard が req.params.projectId を読んで判定。
 * - GET (list / one)  → view
 * - POST / PATCH      → edit
 * - DELETE            → admin 専用
 */
@Controller('projects/:projectId/budgets')
@UseGuards(AuthGuard, RolesGuard, ProjectAccessGuard)
export class BudgetsController {
  constructor(
    private readonly budgets: BudgetsService,
    private readonly exportService: BudgetExportService,
    private readonly historyService: BudgetHistoryService,
  ) {}

  @Get()
  @RequireProjectAccess('view')
  list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.budgets.list(projectId);
  }

  @Get(':budgetId')
  @RequireProjectAccess('view')
  async getOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
  ) {
    const budget = await this.budgets.getById(projectId, budgetId);
    return { budget };
  }

  /**
   * Excel エクスポート (内訳書 / T27)
   *
   * - 読取権限のみで OK (status 不問、approved や superseded でも記録目的でダウンロード可)
   * - filename は日本語のため Content-Disposition は RFC 5987 (filename*=UTF-8'') を併記。
   *   ASCII fallback として `budget_v{n}.xlsx` も `filename=` でセットする
   * - 監査ログに `action='export'` を残す (Service 内で記録)
   */
  @Get(':budgetId/export')
  @RequireProjectAccess('view')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async export(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.exportService.exportToExcel(
      projectId,
      budgetId,
      actorId,
      contextFromReq(req),
    );
    const asciiFallback = `budget_v${budgetId.slice(0, 8)}.xlsx`;
    const encoded = encodeURIComponent(filename);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`,
    );
    res.setHeader('Content-Length', buffer.byteLength.toString());
    return new StreamableFile(buffer);
  }

  /**
   * ワークフロー履歴タイムライン (T33)
   * audit_logs から create / submit / approve / reject / revise / revise_from / export を
   * 業務的節目として抽出。閲覧は view 権限のみ (status 不問)。
   */
  @Get(':budgetId/history')
  @RequireProjectAccess('view')
  async history(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
  ) {
    const items = await this.historyService.listHistory(projectId, budgetId);
    return { items, total: items.length };
  }

  @Post()
  @RequireProjectAccess('edit')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(CreateBudgetRequestSchema)) body: CreateBudgetRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const budget = await this.budgets.create(projectId, body, actorId, contextFromReq(req));
    return { budget };
  }

  @Patch(':budgetId')
  @RequireProjectAccess('edit')
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Body(new ZodValidationPipe(UpdateBudgetRequestSchema)) body: UpdateBudgetRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const budget = await this.budgets.update(
      projectId,
      budgetId,
      body,
      actorId,
      contextFromReq(req),
    );
    return { budget };
  }

  @Delete(':budgetId')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    await this.budgets.softDelete(projectId, budgetId, actorId, contextFromReq(req));
  }

  // =================================================================
  // Workflow (T26): 申請 / 承認 / 差戻し / 改定
  // 動作別 POST endpoint で業務意図を URL / 監査に明示する。
  // =================================================================

  /** 申請: draft → pending_approval (edit 権限のあるユーザが自工事の予算を申請) */
  @Post(':budgetId/submit')
  @RequireProjectAccess('edit')
  async submit(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Body(new ZodValidationPipe(SubmitBudgetRequestSchema)) body: SubmitBudgetRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const budget = await this.budgets.submit(
      projectId,
      budgetId,
      body.lockVersion,
      actorId,
      contextFromReq(req),
    );
    return { budget };
  }

  /** 承認: pending_approval → approved (当面 admin 限定。将来 approver ロールを追加可能) */
  @Post(':budgetId/approve')
  @Roles('admin')
  async approve(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Body(new ZodValidationPipe(ApproveBudgetRequestSchema)) body: ApproveBudgetRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const budget = await this.budgets.approve(
      projectId,
      budgetId,
      body.lockVersion,
      actorId,
      contextFromReq(req),
    );
    return { budget };
  }

  /**
   * 差戻し: pending_approval → draft (admin 限定)
   * body.comment は audit log の after.reason に保存される (DB スキーマ不変)
   */
  @Post(':budgetId/reject')
  @Roles('admin')
  async reject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Body(new ZodValidationPipe(RejectBudgetRequestSchema)) body: RejectBudgetRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const budget = await this.budgets.reject(
      projectId,
      budgetId,
      body,
      actorId,
      contextFromReq(req),
    );
    return { budget };
  }

  /**
   * 改定: approved → superseded + 新 draft (v+1) を作成。
   * レスポンスは **新 draft** budget。フロントはこれに切替表示する。
   */
  @Post(':budgetId/revise')
  @RequireProjectAccess('edit')
  @HttpCode(HttpStatus.CREATED)
  async revise(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Body(new ZodValidationPipe(ReviseBudgetRequestSchema)) body: ReviseBudgetRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const budget = await this.budgets.revise(
      projectId,
      budgetId,
      body.lockVersion,
      actorId,
      contextFromReq(req),
    );
    return { budget };
  }
}

/**
 * BudgetItem (明細) CRUD。
 * URL: /api/v1/projects/:projectId/budgets/:budgetId/items[/...]
 *
 * ABAC は同じ ProjectAccessGuard で OK (req.params.projectId が拾われる)。
 */
@Controller('projects/:projectId/budgets/:budgetId/items')
@UseGuards(AuthGuard, RolesGuard, ProjectAccessGuard)
export class BudgetItemsController {
  constructor(private readonly items: BudgetItemsService) {}

  @Get()
  @RequireProjectAccess('view')
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
  ) {
    return this.items.listTree(projectId, budgetId);
  }

  @Get(':itemId')
  @RequireProjectAccess('view')
  async getOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    const item = await this.items.getById(projectId, budgetId, itemId);
    return { item };
  }

  @Post()
  @RequireProjectAccess('edit')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Body(new ZodValidationPipe(CreateBudgetItemRequestSchema)) body: CreateBudgetItemRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const item = await this.items.create(projectId, budgetId, body, actorId, contextFromReq(req));
    return { item };
  }

  @Patch(':itemId')
  @RequireProjectAccess('edit')
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(UpdateBudgetItemRequestSchema)) body: UpdateBudgetItemRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const item = await this.items.update(
      projectId,
      budgetId,
      itemId,
      body,
      actorId,
      contextFromReq(req),
    );
    return { item };
  }

  /**
   * 削除も楽観ロック必須。
   * クライアントは ?lockVersion=N を付与する (本文を持たない DELETE 慣習に合わせる)。
   */
  @Delete(':itemId')
  @RequireProjectAccess('edit')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query(new ZodValidationPipe(DeleteBudgetItemRequestSchema)) query: DeleteBudgetItemRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    await this.items.softDelete(
      projectId,
      budgetId,
      itemId,
      query.lockVersion,
      actorId,
      contextFromReq(req),
    );
  }
}
