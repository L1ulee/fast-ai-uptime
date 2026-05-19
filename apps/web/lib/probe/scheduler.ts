import { sql } from 'drizzle-orm';
import pMap from 'p-map';
import { getDb } from '@fau/db';
import { probeEnv } from './env';
import { releaseLease } from './lease';
import { loadActiveConfigs, type LoadedConfig } from './load-configs';
import { runOnce } from './runner';
import { withLease } from './with-lease';

const PROBE_LEASE_KEY = 'probe';

/**
 * 内存中：每个 configId → 上次 run 的 epoch ms。
 * 启动时从 check_results.MAX(checked_at) 回填，避免重启后所有 config 同时
 * 被判定为 due 而出现冷启动 burst。
 */
const lastRunAt = new Map<number, number>();
let backfilled = false;

async function backfillLastRunAt(): Promise<void> {
  if (backfilled) return;
  backfilled = true;
  try {
    const db = getDb();
    const rows = (await db.execute(sql`
      SELECT config_id, MAX(checked_at) AS last_at
      FROM check_results
      GROUP BY config_id
    `)) as unknown as Array<{ config_id: number; last_at: string | Date }>;
    for (const row of rows) {
      const t = new Date(row.last_at).getTime();
      if (Number.isFinite(t)) lastRunAt.set(Number(row.config_id), t);
    }
  } catch (err) {
    logError('backfill', err);
  }
}

let timer: NodeJS.Timeout | null = null;
let running = false; // 防止上一轮没结束又开新一轮
let stopped = false;

/**
 * 单次调度。
 * 流程：申请租约 → 加载活跃配置 → 过滤"已到期"的 → 并发 probe + 写库。
 */
async function tick(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    await backfillLastRunAt();

    await withLease(PROBE_LEASE_KEY, probeEnv.nodeId, probeEnv.probeLeaseTtlSeconds, async () => {
      const configs = await loadActiveConfigs();
      const now = Date.now();
      const due = configs.filter((c) => isDue(c, now));
      if (due.length === 0) return;

      // 提前刷新 in-memory lastRunAt（避免并发执行时重复触发）
      for (const c of due) lastRunAt.set(c.id, now);

      await pMap(due, (c) => runOnce(c).catch((err) => logError(c.id, err)), {
        concurrency: probeEnv.checkConcurrency,
        stopOnError: false,
      });
    });
  } catch (err) {
    logError('tick', err);
  } finally {
    running = false;
  }
}

function isDue(config: LoadedConfig, nowMs: number): boolean {
  const last = lastRunAt.get(config.id);
  if (last === undefined) return true; // 从未跑过 → due
  const intervalMs = config.pollIntervalSeconds * 1000;
  return nowMs - last >= intervalMs;
}

function logError(scope: string | number, err: unknown): void {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(`[probe-worker] ${scope}: ${msg}`);
}

/**
 * 启动调度循环（幂等：重复调用不会创建多个 timer）。
 */
export function startScheduler(): void {
  if (timer || stopped) return;
  // 启动前 jitter 0~tickMs 避免多节点同步唤醒
  const jitter = Math.floor(Math.random() * probeEnv.schedulerTickMs);
  setTimeout(() => {
    if (stopped) return;
    timer = setInterval(() => {
      void tick();
    }, probeEnv.schedulerTickMs);
    void tick(); // 立即跑一次
  }, jitter);

  console.log(
    `[probe-worker] scheduler started (node=${probeEnv.nodeId}, ` +
      `tick=${probeEnv.schedulerTickMs}ms, concurrency=${probeEnv.checkConcurrency})`,
  );
}

/**
 * 优雅停机：清 timer，释放租约。
 */
export async function stopScheduler(): Promise<void> {
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  try {
    await releaseLease(PROBE_LEASE_KEY, probeEnv.nodeId);
  } catch {
    // ignore
  }
}
