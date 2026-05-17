import { type LoginRequest, LoginRequestSchema } from '@kgk/schemas';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { UnauthenticatedException } from './auth.exceptions';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CurrentUserId } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(LoginRequestSchema))
  async login(@Body() body: LoginRequest, @Req() req: Request) {
    const user = await this.auth.login(body.email, body.password, contextFromReq(req));
    await regenerateSession(req);
    req.session.userId = user.id;
    return { user };
  }

  /**
   * SSO チケット交換 (ADR-003)。Next.js の callback ハンドラから呼ばれる想定。
   * 成功時は AuthService.exchangeSsoTicket がユーザを upsert して PublicUser を返し、
   * ここで session を regenerate + userId をセットして Set-Cookie を返す。
   */
  @Post('sso/exchange')
  @HttpCode(HttpStatus.OK)
  async ssoExchange(@Body() body: { ticket?: string }, @Req() req: Request) {
    const ticket = (body?.ticket ?? '').trim();
    if (!ticket) {
      throw new UnauthenticatedException();
    }
    const user = await this.auth.exchangeSsoTicket(ticket, contextFromReq(req));
    await regenerateSession(req);
    req.session.userId = user.id;
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async logout(
    @CurrentUserId() userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(userId, contextFromReq(req));
    await destroySession(req);
    res.clearCookie('kgk.sid');
  }
}

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  async me(@CurrentUserId() userId: string) {
    const user = await this.auth.getCurrentUser(userId);
    if (!user) {
      throw new UnauthenticatedException();
    }
    return { user };
  }
}

function contextFromReq(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}
