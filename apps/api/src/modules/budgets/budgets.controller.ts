import {
  type CreateBudgetItemRequest,
  CreateBudgetItemRequestSchema,
  type CreateBudgetRequest,
  CreateBudgetRequestSchema,
  type DeleteBudgetItemRequest,
  DeleteBudgetItemRequestSchema,
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
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { RequireProjectAccess } from '../auth/project-access.decorator';
import { ProjectAccessGuard } from '../auth/project-access.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
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
  constructor(private readonly budgets: BudgetsService) {}

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
