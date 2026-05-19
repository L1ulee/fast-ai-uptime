import { sql } from 'drizzle-orm';
import { getDb } from '@fau/db';
import { probeEnv } from './env';
import { releaseLease } from './lease';
import { withLease } from './with-lease';

const AGGREGATE_LEASE_KEY = 'aggregate';

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = false;

/**
 * 5min 聚合：把上一桶 [bucketStart, bucketStart+5min) 的原始 check_results
 * upsert 进 check_results_5min；同时清理超过保留天数的原始记录。
 *
 * 使用 date_bin（PG14+）将 checked_at 对齐到 5min 边界。
 */
async function tick(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    await withLease(AGGREGATE_LEASE_KEY, probeEnv.nodeId, probeEnv.aggregateLeaseTtlSeconds, () =>
      doAggregate(),
    );
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[probe-worker] aggregate: ${msg}`);
  } finally {
    running = false;
  }
}

async function doAggregate(): Promise<void> {
  const db = getDb();

  // 仅聚合当前 5min 桶之前的、已经"完整"的桶
  await db.execute(sql`
      INSERT INTO check_results_5min (
        config_id, bucket_at, total, ok_count, degraded_count, down_count,
        p50_ms, p95_ms, p99_ms
      )
      SELECT
        config_id,
        date_bin('5 minutes', checked_at, TIMESTAMPTZ '2025-01-01') AS bucket_at,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'ok')::int AS ok_count,
        COUNT(*) FILTER (WHERE status = 'degraded')::int AS degraded_count,
        COUNT(*) FILTER (WHERE status IN ('down','timeout'))::int AS down_count,
        PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS p50_ms,
        PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95_ms,
        PERCENTILE_DISC(0.99) WITHIN GROUP (ORDER BY latency_ms)::int AS p99_ms
      FROM check_results
      WHERE checked_at >= NOW() - INTERVAL '15 minutes'
        AND checked_at < date_bin('5 minutes', NOW(), TIMESTAMPTZ '2025-01-01')
      GROUP BY config_id, bucket_at
      ON CONFLICT (config_id, bucket_at) DO UPDATE SET
        total = EXCLUDED.total,
        ok_count = EXCLUDED.ok_count,
        degraded_count = EXCLUDED.degraded_count,
        down_count = EXCLUDED.down_count,
        p50_ms = EXCLUDED.p50_ms,
        p95_ms = EXCLUDED.p95_ms,
        p99_ms = EXCLUDED.p99_ms
    `);

  // 清理过期原始数据。规模上来后应改为 LIMIT 批量删除避免长事务，
  // M0 阶段保持单语句即可。
  await db.execute(sql`
      DELETE FROM check_results
      WHERE checked_at < NOW() - (${probeEnv.historyRetentionDays}::int * INTERVAL '1 day')
    `);
}

export function startAggregator(): void {
  if (timer || stopped) return;
  // 启动延迟 30s（让首批 probe 先落几条数据）
  setTimeout(() => {
    if (stopped) return;
    timer = setInterval(() => void tick(), probeEnv.aggregateIntervalMs);
    void tick();
  }, 30_000);
  console.log(
    `[probe-worker] aggregator started (interval=${probeEnv.aggregateIntervalMs}ms, ` +
      `retention=${probeEnv.historyRetentionDays}d)`,
  );
}

export async function stopAggregator(): Promise<void> {
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  try {
    await releaseLease(AGGREGATE_LEASE_KEY, probeEnv.nodeId);
  } catch {
    // ignore
  }
}
