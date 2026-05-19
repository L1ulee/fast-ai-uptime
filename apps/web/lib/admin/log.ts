import { getDb, logs } from '@fau/db';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = 'audit' | 'probe' | 'webhook' | 'system';

export interface LogEventInput {
  level?: LogLevel;
  source?: LogSource;
  actor?: string;
  action: string;
  target?: string | null;
  message?: string;
  meta?: unknown;
}

/**
 * 写一条 system log（支撑 /admin/logs）。失败仅 console，不阻塞主流程。
 *
 * audit 来源通常已由 `logAudit()` 写入 audit_logs；logs 页面会把两张表 union。
 * 该 helper 主要给 probe / webhook / system 事件使用，或写入显式的 system 日志。
 */
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    const db = getDb();
    await db.insert(logs).values({
      level: input.level ?? 'info',
      source: input.source ?? 'system',
      actor: input.actor ?? 'system',
      action: input.action,
      target: input.target ?? null,
      message: input.message ?? '',
      meta: input.meta === undefined ? undefined : (input.meta as object),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin-log] failed to write ${input.action}: ${msg}`);
  }
}
