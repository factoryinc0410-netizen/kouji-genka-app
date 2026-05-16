import { z } from 'zod';

export const IdSchema = z.string().uuid();
export type Id = z.infer<typeof IdSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const SortQuerySchema = z.object({
  sort: z.string().optional(),
});
export type SortQuery = z.infer<typeof SortQuerySchema>;

export const ApiErrorFieldSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.array(ApiErrorFieldSchema).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
