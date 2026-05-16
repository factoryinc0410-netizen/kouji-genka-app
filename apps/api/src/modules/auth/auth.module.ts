import { Module } from '@nestjs/common';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginThrottleService } from './login-throttle.service';

@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, LoginThrottleService],
  exports: [AuthService],
})
export class AuthModule {}
