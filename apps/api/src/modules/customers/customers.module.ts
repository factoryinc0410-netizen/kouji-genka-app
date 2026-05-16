import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, RolesGuard],
  exports: [CustomersService],
})
export class CustomersModule {}
