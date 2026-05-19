import { sql } from 'drizzle-orm';
import { getDb } from '@fau/db';

/**
 * 申请或续租。
 * - 行不存在 → INSERT
 * - 行存在且 node_id 是自己 OR 已过期 → 强制续租
 * - 行存在且属于他人且未过期 → 申请失败
 *
 * 返回：true = 拿到/续到租约；false = 别的节点持有。
 */
export async function acquireLease(
  leaseKey: string,
  nodeId: string,
  ttlSeconds: number,
): Promise<boolean> {
  const db = getDb();
  const result = await db.execute(sql`
    INSERT INTO probe_leases (lease_key, node_id, acquired_at, expires_at)
    VALUES (${leaseKey}, ${nodeId}, NOW(), NOW() + (${ttlSeconds}::int * INTERVAL '1 second'))
    ON CONFLICT (lease_key) DO UPDATE
      SET node_id = EXCLUDED.node_id,
          acquired_at = NOW(),
          expires_at = NOW() + (${ttlSeconds}::int * INTERVAL '1 second')
      WHERE probe_leases.node_id = ${nodeId}
         OR probe_leases.expires_at < NOW()
    RETURNING node_id
  `);
  // postgres-js: db.execute(sql) returns array-like rows
  const rows = result as unknown as Array<{ node_id: string }>;
  return rows.length > 0 && rows[0]?.node_id === nodeId;
}

/**
 * 释放租约（仅当持有者是自己时）。
 * 用于优雅停机；若失败（已过期或他人持有）静默忽略。
 */
export async function releaseLease(leaseKey: string, nodeId: string): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    DELETE FROM probe_leases
    WHERE lease_key = ${leaseKey} AND node_id = ${nodeId}
  `);
}
