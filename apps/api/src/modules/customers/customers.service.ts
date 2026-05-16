import type {
  CreateCustomerRequest,
  Customer as CustomerDto,
  CustomerType,
  ListCustomersQuery,
  ListCustomersResponse,
  UpdateCustomerRequest,
} from '@kgk/schemas';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Customer as PrismaCustomer } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { type AuditContext, AuditService } from '../audit/audit.service';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListCustomersQuery): Promise<ListCustomersResponse> {
    const where = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' as const } },
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { nameKana: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.customerType ? { customerType: query.customerType } : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      items: items.map(toPublic),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getById(id: string): Promise<CustomerDto> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '取引先が見つかりません' });
    }
    return toPublic(customer);
  }

  async create(
    input: CreateCustomerRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<CustomerDto> {
    try {
      const created = await this.prisma.customer.create({
        data: {
          code: input.code,
          name: input.name,
          nameKana: input.nameKana ?? null,
          customerType: input.customerType,
          address: input.address ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          contactPerson: input.contactPerson ?? null,
          notes: input.notes ?? null,
        },
      });
      await this.audit.log({
        action: 'create',
        userId: actorId,
        entityType: 'customers',
        entityId: created.id,
        after: snapshot(created),
        ...ctx,
      });
      return toPublic(created);
    } catch (e: unknown) {
      if (isCodeConflict(e)) {
        throw new ConflictException({
          code: 'CUSTOMER_CODE_TAKEN',
          message: '同じ取引先コードのレコードが既に存在します',
        });
      }
      throw e;
    }
  }

  async update(
    id: string,
    input: UpdateCustomerRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<CustomerDto> {
    const before = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!before) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '取引先が見つかりません' });
    }

    const data: Record<string, unknown> = {};
    if (input.code !== undefined) data.code = input.code;
    if (input.name !== undefined) data.name = input.name;
    if (input.nameKana !== undefined) data.nameKana = input.nameKana;
    if (input.customerType !== undefined) data.customerType = input.customerType;
    if (input.address !== undefined) data.address = input.address;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.email !== undefined) data.email = input.email;
    if (input.contactPerson !== undefined) data.contactPerson = input.contactPerson;
    if (input.notes !== undefined) data.notes = input.notes;

    try {
      const updated = await this.prisma.customer.update({ where: { id }, data });
      await this.audit.log({
        action: 'update',
        userId: actorId,
        entityType: 'customers',
        entityId: id,
        before: snapshot(before),
        after: snapshot(updated),
        ...ctx,
      });
      return toPublic(updated);
    } catch (e: unknown) {
      if (isCodeConflict(e)) {
        throw new ConflictException({
          code: 'CUSTOMER_CODE_TAKEN',
          message: '同じ取引先コードのレコードが既に存在します',
        });
      }
      throw e;
    }
  }

  async softDelete(id: string, actorId: string, ctx: AuditContext): Promise<void> {
    const before = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!before) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '取引先が見つかりません' });
    }

    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.log({
      action: 'delete',
      userId: actorId,
      entityType: 'customers',
      entityId: id,
      before: snapshot(before),
      ...ctx,
    });
  }
}

function toPublic(c: PrismaCustomer): CustomerDto {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    nameKana: c.nameKana,
    customerType: c.customerType as CustomerType,
    address: c.address,
    phone: c.phone,
    email: c.email,
    contactPerson: c.contactPerson,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function snapshot(c: PrismaCustomer) {
  return {
    code: c.code,
    name: c.name,
    nameKana: c.nameKana,
    customerType: c.customerType,
    address: c.address,
    phone: c.phone,
    email: c.email,
    contactPerson: c.contactPerson,
    notes: c.notes,
  };
}

function isCodeConflict(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002'
  );
}
