import { SetMetadata } from '@nestjs/common';
import type { ProjectAccessMode } from './project-access.service';

export const PROJECT_ACCESS_KEY = 'kgk.project_access';

/**
 * 工事単位 ABAC を要求するデコレータ。
 * - mode='view': 閲覧権限を要求
 * - mode='edit': 編集権限を要求
 * ProjectAccessGuard と組み合わせて利用 (@UseGuards(AuthGuard, ProjectAccessGuard))。
 */
export const RequireProjectAccess = (mode: ProjectAccessMode): MethodDecorator & ClassDecorator =>
  SetMetadata(PROJECT_ACCESS_KEY, mode);
