import { strict as assert } from 'node:assert';
import { sql } from 'drizzle-orm';
import { getDb } from '@fau/db';
import { dbTest, seedMinimalConfig } from './_test-helpers';

/**
 * 测试版 aggregator：用固定参考时间替代 NOW()，避免跨 5min 桶边界 flaky。
 * SQL 形态与 aggregator.ts/doAggregate 完全一致。
 */
async function runAggregate(refTime: Date, retentionDays: number): Promise<void> {
  const db = getDb();
  const refIso = refTime.toISOString();
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
    WHERE checked_at >= ${refIso}::timestamptz - INTERVAL '15 minutes'
      AND checked_at < date_bin('5 minutes', ${refIso}::timestamptz, TIMESTAMPTZ '2025-01-01')
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
  await db.execute(sql`
    DELETE FROM check_results
    WHERE checked_at < ${refIso}::timestamptz - (${retentionDays}::int * INTERVAL '1 day')
  `);
}

async function insertResultAt(
  configId: number,
  status: string,
  latencyMs: number,
  at: Date,
): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    INSERT INTO check_results (config_id, status, latency_ms, checked_at)
    VALUES (
      ${configId},
      ${status}::check_status,
      ${latencyMs},
      ${at.toISOString()}::timestamptz
    )
  `);
}

/**
 * 选一个落在 5min 桶"中点"的参考时刻：bucket_start + 2.5min。
 * 这样基于此参考的 ±1 / ±6 / ±12 / ±25 分钟样本绝不会跨过测试边界。
 */
function pickReferenceTime(): Date {
  const now = new Date();
  const ms = now.getTime();
  const bucketStart = Math.floor(ms / (5 * 60_000)) * (5 * 60_000);
  return new Date(bucketStart + 2.5 * 60_000);
}

function offsetMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() - minutes * 60_000);
}

dbTest('aggregator: aggregates only completed buckets within 15min window', async () => {
  const id = await seedMinimalConfig();
  const ref = pickReferenceTime();

  // 当前桶（ref 所在的 [bucket, bucket+5min)，不应聚合）
  await insertResultAt(id, 'ok', 100, offsetMinutes(ref, 1));
  await insertResultAt(id, 'ok', 110, offsetMinutes(ref, 2));
  // 上一桶（应聚合）
  await insertResultAt(id, 'ok', 200, offsetMinutes(ref, 6));
  await insertResultAt(id, 'degraded', 800, offsetMinutes(ref, 7));
  // 再上一桶（应聚合）
  await insertResultAt(id, 'down', 30000, offsetMinutes(ref, 12));
  // 超出 15min 窗口（应跳过）
  await insertResultAt(id, 'ok', 50, offsetMinutes(ref, 25));

  await runAggregate(ref, 30);

  const rows = (await getDb().execute(sql`
    SELECT bucket_at, total, ok_count, degraded_count, down_count
    FROM check_results_5min
    WHERE config_id = ${id}
    ORDER BY bucket_at
  `)) as unknown as Array<{
    bucket_at: string;
    total: number;
    ok_count: number;
    degraded_count: number;
    down_count: number;
  }>;

  assert.equal(rows.length, 2, `expected 2 aggregated buckets, got ${rows.length}`);
  const totals = rows.reduce((s, r) => s + Number(r.total), 0);
  assert.equal(totals, 3);
  const okSum = rows.reduce((s, r) => s + Number(r.ok_count), 0);
  const degSum = rows.reduce((s, r) => s + Number(r.degraded_count), 0);
  const downSum = rows.reduce((s, r) => s + Number(r.down_count), 0);
  assert.equal(okSum, 1);
  assert.equal(degSum, 1);
  assert.equal(downSum, 1);
});

dbTest('aggregator: idempotent — re-running with same data does not double-count', async () => {
  const id = await seedMinimalConfig();
  const ref = pickReferenceTime();
  await insertResultAt(id, 'ok', 100, offsetMinutes(ref, 7));
  await insertResultAt(id, 'ok', 110, offsetMinutes(ref, 8));

  await runAggregate(ref, 30);
  await runAggregate(ref, 30);

  const rows = (await getDb().execute(sql`
    SELECT total FROM check_results_5min WHERE config_id = ${id}
  `)) as unknown as Array<{ total: number }>;
  const total = rows.reduce((s, r) => s + Number(r.total), 0);
  assert.equal(total, 2);
});

dbTest('aggregator: retention DELETE clears data older than threshold', async () => {
  const id = await seedMinimalConfig();
  const ref = pickReferenceTime();
  await insertResultAt(id, 'ok', 100, offsetMinutes(ref, 60 * 24)); // 1 day old
  await insertResultAt(id, 'ok', 100, offsetMinutes(ref, 60 * 24 * 31)); // 31 days

  await runAggregate(ref, 30);

  const rows = (await getDb().execute(sql`
    SELECT COUNT(*)::int AS n FROM check_results
  `)) as unknown as Array<{ n: number }>;
  assert.equal(Number(rows[0]!.n), 1);
});
