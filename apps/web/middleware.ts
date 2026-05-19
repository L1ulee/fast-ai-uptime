import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 1) Malformed URI 拒绝:扫描器/爬虫常发 `/%`、`/.env%00` 等畸形百分号编码,
 *    Next 内部 RSC 渲染时会 decodeURIComponent 抛 URIError(digest 2533228455);
 *    在最前面探测一次,畸形直接 400,避免 500 噪音。
 *
 * 2) Cookie 存在性检查(Edge runtime 没有 node:crypto,无法做 HMAC 校验)。
 *    真正的签名校验在 Server Component / Route Handler 内通过 requireAdmin() 完成。
 *    即:本中间件可以拦截"完全未登录"的访问;恶意伪造 cookie 会被下游校验拒绝。
 *
 * 3) CSRF 防护:对 /admin/** 与 /api/admin/** 的状态变更请求(POST/PUT/PATCH/DELETE)
 *    校验 Origin 与 Host 同源;失败 403。Sec-Fetch-Site 作为补充信号。
 */
export function middleware(req: NextRequest) {
  try {
    decodeURIComponent(req.nextUrl.pathname);
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const { pathname } = req.nextUrl;

  if (!pathname.startsWith('/admin') && !pathname.startsWith('/api/admin')) {
    return NextResponse.next();
  }

  // CSRF: state-changing requests 必须 same-origin。
  if (STATE_CHANGING.has(req.method)) {
    const host = req.headers.get('host');
    const origin = req.headers.get('origin');
    const sfs = req.headers.get('sec-fetch-site');
    // Sec-Fetch-Site 是浏览器自带、不可由 JS 设置,'same-origin' 直接放行。
    if (sfs !== 'same-origin' && sfs !== 'none') {
      // 退化检查 Origin。Origin 缺失或与 Host 不同则视为跨站。
      if (!origin || !host) {
        return NextResponse.json({ error: 'csrf' }, { status: 403 });
      }
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        return NextResponse.json({ error: 'csrf' }, { status: 403 });
      }
      if (originHost !== host) {
        return NextResponse.json({ error: 'csrf' }, { status: 403 });
      }
    }
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    if (pathname.startsWith('/api/admin')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // 走全站以拦截畸形 URI;排除 Next 资源 / 静态文件,降低开销。
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|gif|webp|css|js|map|woff|woff2|ttf|txt)$).*)',
  ],
};
