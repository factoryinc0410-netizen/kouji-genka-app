import {
  type CreateProjectRequest,
  CreateProjectRequestSchema,
  type ListProjectsQuery,
  ListProjectsQuerySchema,
  type UpdateProjectRequest,
  UpdateProjectRequestSchema,
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
import { ProjectsService } from './projects.service';

/**
 * 工事 CRUD
 * - list: 認証必須 + ABAC は whereForView による行レベル絞り込み
 * - get(single): @RequireProjectAccess('view')
 * - create: admin / planner
 * - update: @RequireProjectAccess('edit')
 * - delete: admin のみ (論理削除)
 */
@Controller('projects')
@UseGuards(AuthGuard, RolesGuard, ProjectAccessGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @CurrentUserId() actorId: string,
    @Query(new ZodValidationPipe(ListProjectsQuerySchema)) query: ListProjectsQuery,
  ) {
    return this.projects.list(actorId, query);
  }

  @Get(':id')
  @RequireProjectAccess('view')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    const project = await this.projects.getById(id);
    return { project };
  }

  @Post()
  @Roles('admin', 'planner')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateProjectRequestSchema)) body: CreateProjectRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const project = await this.projects.create(body, actorId, contextFromReq(req));
    return { project };
  }

  @Patch(':id')
  @RequireProjectAccess('edit')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateProjectRequestSchema)) body: UpdateProjectRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const project = await this.projects.update(id, body, actorId, contextFromReq(req));
    return { project };
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    await this.projects.softDelete(id, actorId, contextFromReq(req));
  }
}

function contextFromReq(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}
