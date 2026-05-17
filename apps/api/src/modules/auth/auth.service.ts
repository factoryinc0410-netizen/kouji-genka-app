import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PublicUser } from '@kgk/schemas';
import { Inject, Injectable } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { type AuditContext, AuditService } from '../audit/audit.service';
import { InvalidCredentialsException, TooManyAttemptsException } from './auth.exceptions';
import { LoginThrottleService } from './login-throttle.service';
import { SSO_REDIS } from './sso-redis.provider';

const SSO_TICKET_KEY_PREFIX = 'kgk:sso:ticket:';
const SSO_VALID_ROLES = ['admin', 'planner', 'viewer'] as const;
type SsoRole = (typeof SSO_VALID_ROLES)[number];

interface SsoPayload {
  username: string;
  display_name: string;
  role: SsoRole;
  iat: number;
  sig: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly throttle: LoginThrottleService,
    private readonly audit: AuditService,
    @Inject(SSO_REDIS) private readonly redis: Redis,
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

  /**
   * Factoryskills から発行されたワンタイムチケットを検証し、
   * 対応する KGK ユーザを upsert + ロール上書きしてセッションを確立する (ADR-003)。
   *
   * セキュリティ:
   *  - Redis GETDEL で atomic に消費 (replay 完全防止)
   *  - HMAC-SHA256 + 共有秘密で改竄検知
   *  - iat (issued at) からの経過秒数を再チェック (最大 30s)
   *  - role は whitelist 検証 (admin / planner / viewer のみ)
   *
   * upsert ポリシー: ADR-003 §5。email = `{username}@sso.local` をキーに、
   * Factoryskills 側の役割を毎回正として上書きする。
   */
  async exchangeSsoTicket(ticket: string, ctx: AuditContext): Promise<PublicUser> {
    // 1. Redis から取得 + 即削除 (atomic)
    const raw = await this.redis.getdel(`${SSO_TICKET_KEY_PREFIX}${ticket}`);
    if (!raw) {
      await this.audit.log({
        action: 'login_failed',
        entityType: 'sso_session',
        after: { reason: 'ticket_not_found_or_expired' },
        ...ctx,
      });
      throw new InvalidCredentialsException();
    }

    // 2. Payload parse + HMAC 検証
    let payload: SsoPayload;
    try {
      payload = JSON.parse(raw) as SsoPayload;
    } catch {
      throw new InvalidCredentialsException();
    }
    const { sig, ...rest } = payload;
    const expectedSig = this.computeSsoHmac(rest);
    const sigBuf = Buffer.from(sig ?? '', 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      await this.audit.log({
        action: 'login_failed',
        entityType: 'sso_session',
        entityId: rest.username ?? null,
        after: { reason: 'signature_mismatch' },
        ...ctx,
      });
      throw new InvalidCredentialsException();
    }

    // 3. TTL (iat) 再チェック (Redis TTL とは独立した二重防御)
    const maxAge = Number.parseInt(process.env.KGK_SSO_TICKET_MAX_AGE_SEC ?? '30', 10);
    const now = Math.floor(Date.now() / 1000);
    if (typeof rest.iat !== 'number' || now - rest.iat > maxAge || rest.iat > now + 5) {
      await this.audit.log({
        action: 'login_failed',
        entityType: 'sso_session',
        entityId: rest.username,
        after: { reason: 'iat_out_of_range', iat: rest.iat, now },
        ...ctx,
      });
      throw new InvalidCredentialsException();
    }

    // 4. role whitelist 検証
    if (!SSO_VALID_ROLES.includes(rest.role)) {
      throw new InvalidCredentialsException();
    }
    if (typeof rest.username !== 'string' || rest.username.length === 0) {
      throw new InvalidCredentialsException();
    }

    // 5. User upsert
    const email = `${rest.username}@sso.local`;
    const role = await this.prisma.role.findUnique({ where: { code: rest.role } });
    if (!role) {
      throw new InvalidCredentialsException();
    }
    const displayName = rest.display_name || rest.username;
    const user = await this.prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: displayName,
        roleId: role.id,
        passwordHash: null,
        isActive: true,
        lastLoginAt: new Date(),
      },
      update: {
        name: displayName,
        roleId: role.id,
        isActive: true,
        lastLoginAt: new Date(),
      },
      include: { role: true },
    });

    // 6. 監査
    await this.audit.log({
      action: 'login',
      userId: user.id,
      entityType: 'sso_session',
      entityId: user.id,
      after: { method: 'sso', factoryskills_username: rest.username, role: rest.role },
      ...ctx,
    });

    return this.toPublic(user);
  }

  /**
   * SSO payload (sig を除く) に HMAC-SHA256 を計算する。
   * Python 側 `json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))`
   * と完全一致する raw を生成する必要があるため、key を sort して空白なしで stringify する。
   */
  private computeSsoHmac(payload: Omit<SsoPayload, 'sig'>): string {
    const keys = Object.keys(payload).sort();
    const sorted: Record<string, unknown> = {};
    for (const k of keys) sorted[k] = (payload as Record<string, unknown>)[k];
    const raw = JSON.stringify(sorted);
    const secret = process.env.KGK_SSO_SHARED_SECRET ?? '';
    return createHmac('sha256', secret).update(raw).digest('hex');
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
