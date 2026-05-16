import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';
import { BudgetItemsService } from './budget-items.service';
import { BudgetItemsController, BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';

@Module({
  imports: [AuthModule],
  controllers: [BudgetsController, BudgetItemsController],
  providers: [BudgetsService, BudgetItemsService, RolesGuard],
  exports: [BudgetsService, BudgetItemsService],
})
export class BudgetsModule {}
