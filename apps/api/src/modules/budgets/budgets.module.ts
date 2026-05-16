import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';
import { BudgetExportService } from './budget-export.service';
import { BudgetItemsService } from './budget-items.service';
import { BudgetItemsController, BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';

@Module({
  imports: [AuthModule],
  controllers: [BudgetsController, BudgetItemsController],
  providers: [BudgetsService, BudgetItemsService, BudgetExportService, RolesGuard],
  exports: [BudgetsService, BudgetItemsService, BudgetExportService],
})
export class BudgetsModule {}
