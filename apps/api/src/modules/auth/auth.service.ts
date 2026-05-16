import type { PublicUser } from '@kgk/schemas';
import { Injectable } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { type AuditContext, AuditService } from '../audit/audit.service';
import { InvalidCredentialsException, TooManyAttemptsException } from './auth.exceptions';
import { LoginThrottleService } from './login-throttle.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly throttle: LoginThrottleService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, ctx: AuditContext): Promise<PublicUser> {
    const throttle = await this.throttle.registerAttempt(email);
    if (throttle.locked) {
      await this.audit.log({
        action: 'login_failed',
        entityType: 'users',
        entityId: email,
        after: { reason: 'locked', attempts: throttle.attempts },
        ...ctx,
      });
      throw new TooManyAttemptsException(throttle.windowSec);
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    const isValid =
      user?.isActive && user.deletedAt === null && user.passwordHash !== null
        ? await verify(user.passwordHash, password)
        : false;

    if (!isValid || !user) {
      await this.audit.log({
        action: 'login_failed',
        userId: user?.id ?? null,
        entityType: 'users',
        entityId: user?.id ?? email,
        after: { reason: user ? 'invalid_password' : 'unknown_user' },
        ...ctx,
      });
      throw new InvalidCredentialsException();
    }

    await this.throttle.reset(email);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.log({
      action: 'login',
      userId: user.id,
      entityType: 'users',
      entityId: user.id,
      ...ctx,
    });

    return this.toPublic({ ...user, lastLoginAt: new Date() });
  }

  async logout(userId: string, ctx: AuditContext): Promise<void> {
    await this.audit.log({
      action: 'logout',
      userId,
      entityType: 'users',
      entityId: userId,
      ...ctx,
    });
  }

  async getCurrentUser(userId: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isActive: true },
      include: { role: true },
    });
    return user ? this.toPublic(user) : null;
  }

  private toPublic(user: {
    id: string;
    email: string;
    name: string;
    isActive: boolean;
    lastLoginAt: Date | null;
    role: { code: string; name: string };
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      role: { code: user.role.code as PublicUser['role']['code'], name: user.role.name },
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    };
  }
}
