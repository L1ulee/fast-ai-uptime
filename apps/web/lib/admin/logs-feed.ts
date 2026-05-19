import { sql } from 'drizzle-orm';
import { getDb } from '@fau/db';

/**
 * 统一日志流 —— 把 check_results / webhook_deliveries / audit_logs / logs
 * 四张表归一为一个按时间倒序的事件流。同时支撑 /admin/logs 与 /admin 概览的活动日志。
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = 'audit' | 'probe' | 'webhook' | 'system';

export interface UnifiedLogEntry {
  /** 带来源前缀的字符串 id（pr/wh/au/lg + 原始数字 id），跨源唯一。 */
  id: string;
  at: string;
  level: LogLevel;
  source: LogSource;
  actor: string;
  action: string;
  target: string;
  message: string;
  meta: unknown;
}

interface ProbeRawRow {
  id: number;
  checked_at: string | Date;
  status: string;
  latency_ms: number | null;
  http_status: number | null;
  error_kind: string | null;
  error_message: string | null;
  region: string;
  display_name: string;
}

interface WebhookRawRow {
  id: number;
  created_at: string | Date;
  event_type: string;
  status: string;
  attempts: number;
  http_status: number | null;
  duration_ms: number | null;
  last_error: string | null;
  label: string | null;
  channel: string | null;
}

interface AuditRawRow {
  id: number;
  created_at: string | Date;
  actor: string;
  action: string;
  target: string | null;
  payload: unknown;
  ip: string | null;
}

interface SystemRawRow {
  id: number;
  created_at: string | Date;
  level: LogLevel;
  source: LogSource;
  actor: string;
  action: string;
  target: string | null;
  message: string;
  meta: unknown;
}

function iso(d: string | Date): string {
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

/** check_results 一行 → 统一日志条目。 */
function mapProbe(r: ProbeRawRow): UnifiedLogEntry {
  const status = r.status;
  const level: LogLevel = status === 'ok' ? 'info' : status === 'degraded' ? 'warn' : 'error';
  const action =
    status === 'ok'
      ? 'probe.ok'
      : status === 'degraded'
        ? 'probe.slow'
        : status === 'timeout'
          ? 'probe.timeout'
          : 'probe.failed';
  const message =
    status === 'ok'
      ? `HTTP ${r.http_status ?? 200} in ${r.latency_ms ?? 0} ms`
      : (r.error_message ??
        `${r.error_kind ?? 'error'}${r.http_status ? ` · HTTP ${r.http_status}` : ''}`);
  return {
    id: `pr${r.id}`,
    at: iso(r.checked_at),
    level,
    source: 'probe',
    actor: `probe-runner · ${r.region}`,
    action,
    target: r.display_name,
    message,
    meta: {
      status,
      latencyMs: r.latency_ms,
      httpStatus: r.http_status,
      errorKind: r.error_kind,
      region: r.region,
    },
  };
}

/** webhook_deliveries 一行 → 统一日志条目。 */
function mapWebhook(r: WebhookRawRow): UnifiedLogEntry {
  const level: LogLevel =
    r.status === 'delivered' ? 'info' : r.status === 'failed' ? 'error' : 'warn';
  const message =
    r.last_error ??
    `HTTP ${r.http_status ?? 0}${r.duration_ms != null ? ` in ${r.duration_ms} ms` : ''}`;
  return {
    id: `wh${r.id}`,
    at: iso(r.created_at),
    level,
    source: 'webhook',
    actor: r.label ?? `订阅 #${r.id}`,
    action: `webhook.${r.status}`,
    target: r.event_type,
    message,
    meta: {
      httpStatus: r.http_status,
      durationMs: r.duration_ms,
      attempts: r.attempts,
      channel: r.channel,
      error: r.last_error,
    },
  };
}

/** audit_logs 一行 → 统一日志条目。 */
function mapAudit(r: AuditRawRow): UnifiedLogEntry {
  return {
    id: `au${r.id}`,
    at: iso(r.created_at),
    level: 'info',
    source: 'audit',
    actor: r.actor,
    action: r.action,
    target: r.target ?? '—',
    message: r.ip ? `来自 ${r.ip}` : '',
    meta: { ip: r.ip, payload: r.payload ?? null },
  };
}

/** logs 表本身（system 事件，或显式写入的任意来源）。 */
function mapSystem(r: SystemRawRow): UnifiedLogEntry {
  return {
    id: `lg${r.id}`,
    at: iso(r.created_at),
    level: r.level,
    source: r.source,
    actor: r.actor,
    action: r.action,
    target: r.target ?? '—',
    message: r.message,
    meta: r.meta ?? {},
  };
}

/**
 * 读取统一日志流：四个来源各取最近 `limit` 条，合并后按时间倒序取前 `limit` 条。
 * 每个来源各取 `limit` 条以保证合并结果的前 `limit` 条一定正确（即便全部来自同一来源）。
 */
export async function loadUnifiedLogs(opts: { limit?: number } = {}): Promise<UnifiedLogEntry[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 600, 1000));
  const db = getDb();
  const [probeRows, webhookRows, auditRows, systemRows] = await Promise.all([
    db.execute(sql`
      SELECT cr.id, cr.checked_at, cr.status::text AS status, cr.latency_ms,
             cr.http_status, cr.error_kind::text AS error_kind, cr.error_message,
             cr.region, cc.display_name
      FROM check_results cr
      JOIN check_configs cc ON cc.id = cr.config_id
      WHERE cr.checked_at >= NOW() - INTERVAL '7 days'
      ORDER BY cr.checked_at DESC
      LIMIT ${limit}
    `) as unknown as Promise<ProbeRawRow[]>,
    db.execute(sql`
      SELECT wd.id, wd.created_at, wd.event_type, wd.status::text AS status,
             wd.attempts, wd.http_status, wd.duration_ms, wd.last_error,
             s.label, s.channel::text AS channel
      FROM webhook_deliveries wd
      LEFT JOIN subscriptions s ON s.id = wd.subscription_id
      WHERE wd.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY wd.created_at DESC
      LIMIT ${limit}
    `) as unknown as Promise<WebhookRawRow[]>,
    db.execute(sql`
      SELECT id, created_at, actor, action, target, payload, ip
      FROM audit_logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as unknown as Promise<AuditRawRow[]>,
    db.execute(sql`
      SELECT id, created_at, level::text AS level, source::text AS source,
             actor, action, target, message, meta
      FROM logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as unknown as Promise<SystemRawRow[]>,
  ]);

  return [
    ...probeRows.map(mapProbe),
    ...webhookRows.map(mapWebhook),
    ...auditRows.map(mapAudit),
    ...systemRows.map(mapSystem),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}
