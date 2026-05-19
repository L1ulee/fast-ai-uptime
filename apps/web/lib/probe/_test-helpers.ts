import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from '@fau/db';

const __dirname = dirname(fileURLToPath(import.meta.url));

let envLoaded = false;
function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  for (const c of ['.env.local', '.env']) {
    const p = resolve(__dirname, '../../../..', c);
    if (existsSync(p)) {
      process.loadEnvFile(p);
      break;
    }
  }
}

/**
 * 检测本地 Postgres 是否可用；不可用时返回 false，调用方应 skip 测试。
 */
export async function ensureDb(): Promise<boolean> {
  loadEnv();
  if (!process.env.DATABASE_URL) return false;
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * 清空所有业务表（保留 enum / schema），重置 sequence。
 * CASCADE 不影响 enum / sequence，仅 truncate 表数据。
 */
export async function truncateAll(): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    TRUNCATE TABLE
      check_results, check_results_5min, check_configs, models, providers,
      probe_leases, incidents, incident_updates, incident_components,
      maintenances, maintenance_components, announcements,
      official_status_snapshots, subscriptions, subscription_components,
      audit_logs
    RESTART IDENTITY CASCADE
  `);
}

export async function teardown(): Promise<void> {
  await closeDb();
}

let cachedDbReady: boolean | undefined;
async function dbAvailable(): Promise<boolean> {
  if (cachedDbReady !== undefined) return cachedDbReady;
  cachedDbReady = await ensureDb();
  return cachedDbReady;
}

interface TestCtx {
  skip(msg?: string): void;
}

/**
 * 包装 test()：自动检测 DB 是否可达；不可达则跳过；可达则先 truncate 再跑。
 */
export function dbTest(name: string, fn: (t: TestCtx) => Promise<void>): void {
  // 延迟到 test 执行期再 import，避免循环依赖问题
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { test } = require('node:test') as typeof import('node:test');
  test(name, async (t: TestCtx) => {
    if (!(await dbAvailable())) {
      t.skip('DATABASE_URL not reachable');
      return;
    }
    await truncateAll();
    await fn(t);
  });
}

/**
 * 插入一个最小可用的 check_config 与其依赖的 provider/model；返回 config_id。
 */
export async function seedMinimalConfig(opts?: { pollIntervalSeconds?: number }): Promise<number> {
  const db = getDb();
  const rows = (await db.execute(sql`
    WITH p AS (
      INSERT INTO providers (type, name) VALUES ('custom', 'Test')
      RETURNING id
    ),
    m AS (
      INSERT INTO models (provider_id, model_name)
      SELECT id, 'test-model' FROM p
      RETURNING id
    )
    INSERT INTO check_configs (
      model_id, display_name, endpoint, method, enabled,
      poll_interval_seconds, timeout_ms
    )
    SELECT id, 'Test Component', 'http://localhost:3000/api/healthz', 'HEAD', true,
           ${opts?.pollIntervalSeconds ?? 60}, 5000
    FROM m
    RETURNING id
  `)) as unknown as Array<{ id: number }>;
  return Number(rows[0]!.id);
}
