/**
 * Brute-force defence for /admin login.
 *
 * 单实例内存计数器:每个 IP 在滚动窗口内累计失败次数,超过阈值后进入冷却。
 * 多实例部署需替换为共享存储(Redis)，单实例足以挡掉自动化爆破。
 *
 * 触发的语义:
 *   - 每次失败 +1（在窗口内累计）
 *   - 达到 MAX_FAILURES 后阻塞 LOCKOUT_MS（每次后续阻塞期内的失败再延长）
 *   - 成功登录立即清零
 */

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 min
const LOCKOUT_MS = 15 * 60 * 1000; // 15 min
// 限制 map 大小:超过这个数硬性裁掉最旧项,避免内存被遍历 IP 撑爆。
const MAX_TRACKED_IPS = 10_000;

interface AttemptState {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number;
}

const attempts = new Map<string, AttemptState>();

function purgeStale(now: number): void {
  if (attempts.size < MAX_TRACKED_IPS) return;
  for (const [key, st] of attempts) {
    if (st.blockedUntil < now && now - st.firstFailureAt > WINDOW_MS) {
      attempts.delete(key);
    }
    if (attempts.size < MAX_TRACKED_IPS / 2) break;
  }
}

export interface LoginGuardDecision {
  allowed: boolean;
  /** 剩余阻塞秒数（allowed=false 时有值，便于显示给用户）。 */
  retryAfterSeconds?: number;
}

/** 在尝试登录前调用。被阻塞则返回 allowed=false。 */
export function checkLoginAllowed(ip: string): LoginGuardDecision {
  if (!ip) return { allowed: true };
  const now = Date.now();
  const st = attempts.get(ip);
  if (!st) return { allowed: true };
  if (st.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((st.blockedUntil - now) / 1000),
    };
  }
  return { allowed: true };
}

/** 在 verifyPassword 后调用，记录本次结果。成功立即清零。 */
export function recordLoginAttempt(ip: string, ok: boolean): void {
  if (!ip) return;
  const now = Date.now();
  if (ok) {
    attempts.delete(ip);
    return;
  }
  purgeStale(now);
  const st = attempts.get(ip);
  if (!st || now - st.firstFailureAt > WINDOW_MS) {
    attempts.set(ip, { failures: 1, firstFailureAt: now, blockedUntil: 0 });
    return;
  }
  st.failures += 1;
  if (st.failures >= MAX_FAILURES) {
    st.blockedUntil = now + LOCKOUT_MS;
  }
}

/** 测试辅助:清空全部记录。 */
export function __resetLoginGuardForTesting(): void {
  attempts.clear();
}
