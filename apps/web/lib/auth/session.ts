import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天

// Historical demo values that were once shipped in docker-compose.yml. Reject
// them so an upgrade can't silently keep the predictable secret/password.
const BANNED_SESSION_SECRETS = new Set([
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
]);
const BANNED_ADMIN_PASSWORDS = new Set(['changeme', 'fau-demo-2026']);

let cachedSecret: Buffer | null = null;
let cachedAdminPassword: string | null = null;

function loadSessionSecret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const raw = process.env.SESSION_SECRET;
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('SESSION_SECRET is missing or invalid. Generate with: openssl rand -hex 32');
  }
  if (BANNED_SESSION_SECRETS.has(raw.toLowerCase())) {
    throw new Error('SESSION_SECRET matches a known demo value. Rotate with: openssl rand -hex 32');
  }
  cachedSecret = Buffer.from(raw, 'hex');
  return cachedSecret;
}

function loadAdminPassword(): string {
  if (cachedAdminPassword !== null) return cachedAdminPassword;
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error('ADMIN_PASSWORD is not set');
  if (BANNED_ADMIN_PASSWORDS.has(pw) && process.env.NODE_ENV === 'production') {
    throw new Error(
      'ADMIN_PASSWORD matches a known demo value. Set a unique password in production.',
    );
  }
  cachedAdminPassword = pw;
  return cachedAdminPassword;
}

export { SESSION_COOKIE_NAME } from './constants';

/**
 * 校验提交的密码与 ADMIN_PASSWORD 是否一致（恒定时间比较）。
 */
export function verifyPassword(submitted: string): boolean {
  const expected = loadAdminPassword();
  const a = Buffer.from(submitted, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * 生成会话 token：base64url(payload).base64url(hmac)
 * payload 仅是 expiry epoch ms。
 */
export function createSessionToken(now: number = Date.now()): string {
  const expiry = now + SESSION_TTL_SECONDS * 1000;
  const payload = String(expiry);
  const sig = createHmac('sha256', loadSessionSecret()).update(payload).digest();
  return `${b64url(Buffer.from(payload))}.${b64url(sig)}`;
}

/**
 * 解析并校验 token。
 * 通过返回剩余秒数，否则返回 null。
 */
export function verifySessionToken(
  token: string | undefined | null,
  now: number = Date.now(),
): { remainingSeconds: number; expiresAt: number } | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts as [string, string];
  let payload: Buffer;
  let sig: Buffer;
  try {
    payload = Buffer.from(payloadB64, 'base64url');
    sig = Buffer.from(sigB64, 'base64url');
  } catch {
    return null;
  }
  if (sig.length !== 32) return null;
  const expected = createHmac('sha256', loadSessionSecret()).update(payload).digest();
  if (!timingSafeEqual(sig, expected)) return null;
  const expiry = Number.parseInt(payload.toString('utf8'), 10);
  if (!Number.isFinite(expiry) || expiry <= now) return null;
  return { remainingSeconds: Math.floor((expiry - now) / 1000), expiresAt: expiry };
}

function b64url(b: Buffer): string {
  return b.toString('base64url');
}

export const SESSION_TTL = SESSION_TTL_SECONDS;
