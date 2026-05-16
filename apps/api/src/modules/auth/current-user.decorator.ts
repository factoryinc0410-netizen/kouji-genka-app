import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const CurrentUserId = createParamDecorator(
  (_: unknown, context: ExecutionContext): string => {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.session?.userId;
    if (!userId) {
      throw new Error('CurrentUserId used without AuthGuard');
    }
    return userId;
  },
);
