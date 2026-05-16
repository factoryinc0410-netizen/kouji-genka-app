import { z } from 'zod';
import { PublicUserSchema, RoleCodeSchema } from './auth';

export const CreateUserRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(12).max(256),
  name: z.string().trim().min(1).max(100),
  roleCode: RoleCodeSchema,
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255).optional(),
    name: z.string().trim().min(1).max(100).optional(),
    roleCode: RoleCodeSchema.optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(12).max(256).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: '少なくとも 1 つのフィールドを指定してください',
  });
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().max(255).optional(),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

export const ListUsersResponseSchema = z.object({
  items: z.array(PublicUserSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
export type ListUsersResponse = z.infer<typeof ListUsersResponseSchema>;

export const UserResponseSchema = z.object({
  user: PublicUserSchema,
});
export type UserResponse = z.infer<typeof UserResponseSchema>;
