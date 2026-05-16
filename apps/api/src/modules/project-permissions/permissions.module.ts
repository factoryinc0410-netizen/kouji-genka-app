import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { ProjectPermissionsController } from './permissions.controller';
import { ProjectPermissionsService } from './permissions.service';

@Module({
  controllers: [ProjectPermissionsController],
  providers: [ProjectPermissionsService, RolesGuard],
  exports: [ProjectPermissionsService],
})
export class ProjectPermissionsModule {}
