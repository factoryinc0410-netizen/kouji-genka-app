import {
  type CreateUserRequest,
  CreateUserRequestSchema,
  type ListUsersQuery,
  ListUsersQuerySchema,
  type UpdateUserRequest,
  UpdateUserRequestSchema,
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
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(@Query(new ZodValidationPipe(ListUsersQuerySchema)) query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Get(':id')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.users.getById(id);
    return { user };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateUserRequestSchema)) body: CreateUserRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const user = await this.users.create(body, actorId, contextFromReq(req));
    return { user };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateUserRequestSchema)) body: UpdateUserRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const user = await this.users.update(id, body, actorId, contextFromReq(req));
    return { user };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    await this.users.softDelete(id, actorId, contextFromReq(req));
  }
}

function contextFromReq(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}
