import { HttpException, HttpStatus } from '@nestjs/common';

export class InvalidCredentialsException extends HttpException {
  constructor() {
    super(
      { code: 'INVALID_CREDENTIALS', message: 'メールアドレスまたはパスワードが正しくありません' },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class TooManyAttemptsException extends HttpException {
  constructor(retryAfterSec: number) {
    super(
      {
        code: 'TOO_MANY_ATTEMPTS',
        message: `ログイン試行回数の上限に達しました。${retryAfterSec} 秒後に再試行してください`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class UnauthenticatedException extends HttpException {
  constructor() {
    super({ code: 'UNAUTHENTICATED', message: '認証が必要です' }, HttpStatus.UNAUTHORIZED);
  }
}
