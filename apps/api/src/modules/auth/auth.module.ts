import { Module } from '@nestjs/common';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginThrottleService } from './login-throttle.service';
import { ProjectAccessGuard } from './project-access.guard';
import { ProjectAccessService } from './project-access.service';
import { SsoRedisProvider } from './sso-redis.provider';

@Module({
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    LoginThrottleService,
    ProjectAccessService,
    ProjectAccessGuard,
    SsoRedisProvider,
  ],
  exports: [AuthService, ProjectAccessService, ProjectAccessGuard],
})
export class AuthModule {}
