import {
  type CreateCustomerRequest,
  CreateCustomerRequestSchema,
  type ListCustomersQuery,
  ListCustomersQuerySchema,
  type UpdateCustomerRequest,
  UpdateCustomerRequestSchema,
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
import { CustomersService } from './customers.service';

/**
 * 取引先マスタ CRUD
 * - list / get: admin / accounting / planner
 * - create / update: admin / accounting (取引先マスタは経理マスタ管理)
 * - delete: admin のみ (誤削除回避、原価系への影響を最小化)
 */
@Controller('customers')
@UseGuards(AuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Roles('admin', 'accounting', 'planner')
  list(@Query(new ZodValidationPipe(ListCustomersQuerySchema)) query: ListCustomersQuery) {
    return this.customers.list(query);
  }

  @Get(':id')
  @Roles('admin', 'accounting', 'planner')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    const customer = await this.customers.getById(id);
    return { customer };
  }

  @Post()
  @Roles('admin', 'accounting')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateCustomerRequestSchema)) body: CreateCustomerRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const customer = await this.customers.create(body, actorId, contextFromReq(req));
    return { customer };
  }

  @Patch(':id')
  @Roles('admin', 'accounting')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCustomerRequestSchema)) body: UpdateCustomerRequest,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    const customer = await this.customers.update(id, body, actorId, contextFromReq(req));
    return { customer };
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    await this.customers.softDelete(id, actorId, contextFromReq(req));
  }
}

function contextFromReq(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}
