import { sql } from 'drizzle-orm';
import { getDb } from '@fau/db';
import { getSettings } from '@/lib/admin/settings';
import { probeEnv } from './env';
import { releaseLease } from './lease';
import { withLease } from './with-lease';

const LEASE_KEY = 'log-cleanup';
const TICK_MS = 5 * 60 * 1000; // 每 5 分钟检查一次"现在是不是该清理小时"
const LEASE_TTL_SECONDS = 30 * 60;

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = false;
let lastRunDateKey: string | null = null; // 已在某站点时区某日运行过,避免同日重跑

/** 返回 IANA tz 当前 (hour, dateKey="YYYY-MM-DD")。 */
function nowInTz(tz: string): { hour: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hourStr = get('hour');
  // Chromium 在 hour12:false 偶尔输出 "24" 代表次日 00:00
  const hour = hourStr === '24' ? 0 : Number.parseInt(hourStr, 10);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

async function performCleanup(
  retentionDays: typeof import('@/lib/admin/settings').DEFAULT_SETTINGS.logs.retention,
): Promise<void> {
  const db = getDb();
  // 4 张表 + 各自保留天数 (天 → INTERVAL '1 day' * N 走参数绑定)
  const ops: Array<{ table: string; col: string; days: number }> = [
    { table: 'audit_logs', col: 'created_at', days: retentionDays.audit },
    { table: 'check_results', col: 'checked_at', days: retentionDays.probe },
    { table: 'webhook_deliveries', col: 'created_at', days: retentionDays.webhook },
    { table: 'logs', col: 'created_at', days: retentionDays.system },
  ];
  for (const op of ops) {
    try {
      await db.execute(sql`
        DELETE FROM ${sql.identifier(op.table)}
        WHERE ${sql.identifier(op.col)} < NOW() - INTERVAL '1 day' * ${op.days}
      `);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[log-cleanup] ${op.table} failed: ${msg}`);
    }
  }
}

async function tick(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    const settings = await getSettings();
    const tz = settings.site.timezone || 'UTC';
    const target = settings.logs.cleanupHour;
    const { hour, dateKey } = nowInTz(tz);
    if (hour !== target) return;
    if (lastRunDateKey === `${tz}|${dateKey}`) return;
    await withLease(LEASE_KEY, probeEnv.nodeId, LEASE_TTL_SECONDS, async () => {
      console.log(`[log-cleanup] running for ${dateKey} ${String(hour).padStart(2, '0')}:00 ${tz}`);
      await performCleanup(settings.logs.retention);
      lastRunDateKey = `${tz}|${dateKey}`;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[log-cleanup] ${msg}`);
  } finally {
    running = false;
  }
}

export function startLogCleanup(): void {
  if (timer || stopped) return;
  // 启动后 30s 跑一次,之后每 TICK_MS 一次。
  setTimeout(() => {
    if (stopped) return;
    timer = setInterval(() => void tick(), TICK_MS);
    void tick();
  }, 30_000);
  console.log(`[log-cleanup] started (check every ${TICK_MS / 1000}s)`);
}

export async function stopLogCleanup(): Promise<void> {
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  try {
    await releaseLease(LEASE_KEY, probeEnv.nodeId);
  } catch {
    // ignore
  }
}
