import { z } from 'zod';

export const ROLE_CODES = ['admin', 'planner', 'field', 'accounting', 'viewer'] as const;
export const RoleCodeSchema = z.enum(ROLE_CODES);
export type RoleCode = z.infer<typeof RoleCodeSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const PublicUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  isActive: z.boolean(),
  role: z.object({
    code: RoleCodeSchema,
    name: z.string(),
  }),
  lastLoginAt: z.string().datetime().nullable(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const LoginResponseSchema = z.object({
  user: PublicUserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const MeResponseSchema = LoginResponseSchema;
export type MeResponse = z.infer<typeof MeResponseSchema>;
