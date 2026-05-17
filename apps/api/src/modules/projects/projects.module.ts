import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';
import { ProjectStatusHistoryService } from './project-status-history.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AuthModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectStatusHistoryService, RolesGuard],
  exports: [ProjectsService, ProjectStatusHistoryService],
})
export class ProjectsModule {}
