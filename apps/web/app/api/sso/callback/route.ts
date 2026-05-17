/**
 * SSO callback (ADR-003)。
 *
 * Factoryskills の /sso/kgk/start からブラウザがここに 303 されてくる。
 * ?ticket=<token> を受け取り、内部の NestJS API
 * (POST /api/v1/auth/sso/exchange) に転送して KGK セッションを確立する。
 * NestJS が返す Set-Cookie (kgk.sid) をブラウザに中継したのち、KGK の
 * 既定ダッシュボードへ 303 でリダイレクトする。
 *
 * 失敗時はすべて /login?sso_error=<reason> へ落とす (ループ防止のため SSO 起点には戻さない)。
 */
import { NextResponse } from 'next/server';

const FALLBACK_PATH = '/login';
const DASHBOARD_PATH = '/admin/dashboard';

function withBasePath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return `${base}${path}`;
}

function internalApiBase(): string {
  // Next.js サーバから NestJS への内部呼び出し URL (.env で上書き可能)
  const root = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
  return `${root}/api/v1`;
}

function failureRedirect(origin: string, reason: string): NextResponse {
  const url = new URL(withBasePath(FALLBACK_PATH), origin);
  url.searchParams.set('sso_error', reason);
  return NextResponse.redirect(url, 303);
}

export async function GET(request: Request): Promise<NextResponse> {
  const reqUrl = new URL(request.url);
  const ticket = reqUrl.searchParams.get('ticket');
  if (!ticket) {
    return failureRedirect(reqUrl.origin, 'missing_ticket');
  }

  let apiRes: Response;
  try {
    apiRes = await fetch(`${internalApiBase()}/auth/sso/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
  } catch {
    return failureRedirect(reqUrl.origin, 'api_unreachable');
  }

  if (!apiRes.ok) {
    return failureRedirect(reqUrl.origin, `exchange_${apiRes.status}`);
  }

  // 成功 → ダッシュボードへ。Set-Cookie ヘッダ (kgk.sid) を client に転送する。
  const dashboardUrl = new URL(withBasePath(DASHBOARD_PATH), reqUrl.origin);
  const response = NextResponse.redirect(dashboardUrl, 303);

  // Node fetch では複数 Set-Cookie が getSetCookie() で配列取得できる (Node 22 OK)
  const setCookies =
    typeof apiRes.headers.getSetCookie === 'function'
      ? apiRes.headers.getSetCookie()
      : ((): string[] => {
          const single = apiRes.headers.get('set-cookie');
          return single ? [single] : [];
        })();
  for (const cookie of setCookies) {
    response.headers.append('Set-Cookie', cookie);
  }

  return response;
}
