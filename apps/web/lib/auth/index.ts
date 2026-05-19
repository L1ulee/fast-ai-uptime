import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL,
  createSessionToken,
  verifyPassword,
  verifySessionToken,
} from './session';
import { checkLoginAllowed, recordLoginAttempt } from './rate-limit';

export { SESSION_COOKIE_NAME, SESSION_TTL };
export { checkLoginAllowed, recordLoginAttempt };

/**
 * 服务端检查请求是否已登录（仅基于 cookie 中的会话签名）。
 */
export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token) !== null;
}

/**
 * Server Component / Server Action 顶部使用：未登录则重定向到 /login。
 *
 * 重要：Server Action 的鉴权 *必须* 在 action 内显式调用此函数。
 * Next.js layout 在 action 执行前不会运行，仅靠 layout 的 requireAdmin 不足以
 * 保护 action mutations（伪造/过期 cookie 会绕过中间件的 presence 检查）。
 */
export async function requireAdmin(redirectTo: string = '/login'): Promise<void> {
  if (!(await isAuthenticated())) {
    redirect(redirectTo);
  }
}

/**
 * 登录：验证密码 → 写 cookie。
 * 成功返回 true；密码错误返回 false。
 */
export async function loginWithPassword(password: string): Promise<boolean> {
  if (!verifyPassword(password)) return false;
  const token = createSessionToken();
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL,
  });
  return true;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
