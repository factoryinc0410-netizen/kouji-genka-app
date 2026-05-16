import { z } from 'zod';

export const CUSTOMER_TYPES = ['client', 'general', 'subcontractor', 'supplier'] as const;
export const CustomerTypeSchema = z.enum(CUSTOMER_TYPES);
export type CustomerType = z.infer<typeof CustomerTypeSchema>;

export const CustomerSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  nameKana: z.string().nullable(),
  customerType: CustomerTypeSchema,
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  contactPerson: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Customer = z.infer<typeof CustomerSchema>;

export const CreateCustomerRequestSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  nameKana: z.string().trim().max(200).optional(),
  customerType: CustomerTypeSchema,
  address: z.string().trim().max(2000).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().toLowerCase().email().max(255).optional(),
  contactPerson: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(5000).optional(),
});
export type CreateCustomerRequest = z.infer<typeof CreateCustomerRequestSchema>;

export const UpdateCustomerRequestSchema = z
  .object({
    code: z.string().trim().min(1).max(50).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    nameKana: z.string().trim().max(200).nullable().optional(),
    customerType: CustomerTypeSchema.optional(),
    address: z.string().trim().max(2000).nullable().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    email: z.string().trim().toLowerCase().email().max(255).nullable().optional(),
    contactPerson: z.string().trim().max(100).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: '少なくとも 1 つのフィールドを指定してください',
  });
export type UpdateCustomerRequest = z.infer<typeof UpdateCustomerRequestSchema>;

export const ListCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** code / name / name_kana への部分一致 (大文字小文字無視) */
  search: z.string().trim().max(255).optional(),
  customerType: CustomerTypeSchema.optional(),
});
export type ListCustomersQuery = z.infer<typeof ListCustomersQuerySchema>;

export const ListCustomersResponseSchema = z.object({
  items: z.array(CustomerSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
export type ListCustomersResponse = z.infer<typeof ListCustomersResponseSchema>;

export const CustomerResponseSchema = z.object({
  customer: CustomerSchema,
});
export type CustomerResponse = z.infer<typeof CustomerResponseSchema>;
