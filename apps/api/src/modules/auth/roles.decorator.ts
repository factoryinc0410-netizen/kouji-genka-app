import type { RoleCode } from '@kgk/schemas';
import { SetMetadata } from '@nestjs/common';

export const ROLES_METADATA_KEY = 'kgk.roles';

export const Roles = (...roles: RoleCode[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, roles);
