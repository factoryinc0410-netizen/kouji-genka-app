import {
  type GrantProjectPermissionRequest,
  GrantProjectPermissionRequestSchema,
  type UpdateProjectPermissionRequest,
  UpdateProjectPermissionRequestSchema,
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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProjectPermissionsService } from './permissions.service';

/**
 * 工事 × ユーザの権限 (UPP) CRUD。
 * 権限付与は admin 専権 (運用判断)。
 */
@Controller('projects/:projectId/permissions')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class ProjectPermissionsController {
  constructor(private readonly perms: ProjectPermissionsService) {}

  @Get()
  list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.perms.list(projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async grant(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(GrantProjectPermissionRequestSchema))
    body: GrantProjectPermissionRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const permission = await this.perms.grant(projectId, body, actorId, contextFromReq(req));
    return { permission };
  }

  @Patch(':userId')
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(UpdateProjectPermissionRequestSchema))
    body: UpdateProjectPermissionRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const permission = await this.perms.update(
      projectId,
      userId,
      body,
      actorId,
      contextFromReq(req),
    );
    return { permission };
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    await this.perms.revoke(projectId, userId, actorId, contextFromReq(req));
  }
}

function contextFromReq(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}
