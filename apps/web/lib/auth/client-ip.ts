import { headers } from 'next/headers';

/**
 * 解析客户端 IP,**防伪造**版本。
 *
 * 任何客户端都能塞 `X-Forwarded-For` / `X-Real-IP` / `CF-Connecting-IP` header,
 * 无条件读取等于放弃限速保护。所有读取必须由部署方显式 opt-in:
 *
 *   TRUSTED_PROXY_HOPS=N   : 直接前面有 N 个可信反代,取 XFF 的倒数第 N 个
 *   TRUSTED_CLOUDFLARE=1   : 信任 cf-connecting-ip (仅当真在 Cloudflare 后)
 *   TRUSTED_REAL_IP=1      : 信任 x-real-ip (仅当上游可信反代会注入)
 *
 * 全部 unset (默认) → 不信任任何 header → 退化为 'unknown'。在直接面向公网的
 * 部署中这是安全的默认值;限速会退化为全局桶,但不会被伪造。
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();

  if (process.env.TRUSTED_CLOUDFLARE === '1') {
    const cfIp = h.get('cf-connecting-ip')?.trim();
    if (cfIp) return cfIp;
  }

  if (process.env.TRUSTED_REAL_IP === '1') {
    const realIp = h.get('x-real-ip')?.trim();
    if (realIp) return realIp;
  }

  const hops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '0', 10);
  if (Number.isFinite(hops) && hops > 0) {
    const xff = h.get('x-forwarded-for');
    if (xff) {
      const parts = xff
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      // 取倒数第 hops 个;链长不足表示客户端在伪造
      if (parts.length >= hops) {
        const ip = parts[parts.length - hops];
        if (ip) return ip;
      }
    }
  }

  return 'unknown';
}
