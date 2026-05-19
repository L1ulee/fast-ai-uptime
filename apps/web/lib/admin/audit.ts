import { auditLogs, getDb } from '@fau/db';
import { getClientIp } from '@/lib/auth/client-ip';

/**
 * 从请求头解析客户端 IP（按 TRUSTED_PROXY_HOPS 决定能否信任 XFF）。
 */
async function readClientIp(): Promise<string | null> {
  try {
    const ip = await getClientIp();
    return ip === 'unknown' ? null : ip;
  } catch {
    return null;
  }
}

/**
 * 写一条 audit_log。失败仅 console，不阻塞主流程。
 */
export async function logAudit(action: string, target?: string, payload?: unknown): Promise<void> {
  try {
    const ip = await readClientIp();
    const db = getDb();
    await db.insert(auditLogs).values({
      actor: 'admin',
      action,
      target,
      payload: payload === undefined ? undefined : (payload as object),
      ip,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin-audit] failed to log ${action}: ${msg}`);
  }
}
