import { strict as assert } from 'node:assert';
import { sql } from 'drizzle-orm';
import { getDb } from '@fau/db';
import { acquireLease, releaseLease } from './lease';
import { dbTest } from './_test-helpers';
import { withLease } from './with-lease';

dbTest('acquireLease: first acquire on empty row inserts and returns true', async () => {
  const got = await acquireLease('probe', 'node-A', 60);
  assert.equal(got, true);
});

dbTest('acquireLease: same node re-acquire renews TTL', async () => {
  await acquireLease('probe', 'node-A', 5);
  const before = await readExpiresAt('probe');
  await new Promise((r) => setTimeout(r, 50));
  const ok = await acquireLease('probe', 'node-A', 30);
  assert.equal(ok, true);
  const after = await readExpiresAt('probe');
  assert.ok(after.getTime() > before.getTime(), 'TTL should advance on renew');
});

dbTest('acquireLease: different node fails to acquire while not expired', async () => {
  const a = await acquireLease('probe', 'node-A', 60);
  assert.equal(a, true);
  const b = await acquireLease('probe', 'node-B', 60);
  assert.equal(b, false);
});

dbTest('acquireLease: different node CAN acquire after expiry', async () => {
  await acquireLease('probe', 'node-A', 60);
  await getDb().execute(sql`
    UPDATE probe_leases SET expires_at = NOW() - INTERVAL '10 seconds'
    WHERE lease_key = 'probe'
  `);
  const b = await acquireLease('probe', 'node-B', 60);
  assert.equal(b, true);
  const owner = await readNodeId('probe');
  assert.equal(owner, 'node-B');
});

dbTest('acquireLease: concurrent acquires from 3 nodes — exactly 1 winner', async () => {
  const results = await Promise.all([
    acquireLease('probe', 'node-A', 60),
    acquireLease('probe', 'node-B', 60),
    acquireLease('probe', 'node-C', 60),
  ]);
  const winners = results.filter((x) => x === true).length;
  assert.equal(winners, 1, `expected exactly 1 winner, got ${winners}`);
});

dbTest('releaseLease: only deletes when called by the owner', async () => {
  await acquireLease('probe', 'node-A', 60);
  await releaseLease('probe', 'node-X');
  assert.equal(await readNodeId('probe'), 'node-A');
  await releaseLease('probe', 'node-A');
  assert.equal(await readNodeId('probe'), null);
});

dbTest('withLease: runs fn and returns its result when acquired', async () => {
  const r = await withLease('probe', 'node-A', 60, async () => 42);
  assert.equal(r, 42);
});

dbTest('withLease: returns null without running fn when held by another', async () => {
  await acquireLease('probe', 'node-A', 60);
  let ran = false;
  const r = await withLease('probe', 'node-B', 60, async () => {
    ran = true;
    return 1;
  });
  assert.equal(r, null);
  assert.equal(ran, false);
});

dbTest('withLease: renews lease mid-flight beyond original TTL', async () => {
  // TTL=2s；fn 运行 3s。中点检测 expires_at 必须晚于初始 expires_at（已被续过）。
  const captured: { initial?: Date; mid?: Date } = {};
  await withLease('probe', 'node-A', 2, async () => {
    captured.initial = await readExpiresAt('probe');
    await new Promise((r) => setTimeout(r, 1_500));
    captured.mid = await readExpiresAt('probe');
    await new Promise((r) => setTimeout(r, 1_500));
  });
  if (!captured.initial || !captured.mid) {
    throw new Error('expected both initial and mid expires_at captured');
  }
  // 中点 expires_at 应明显晚于初始（renewer 在 1s 处刷新过）
  const advanceMs = captured.mid.getTime() - captured.initial.getTime();
  assert.ok(advanceMs >= 500, `lease should be renewed mid-flight, advanced=${advanceMs}ms`);
});

async function readNodeId(leaseKey: string): Promise<string | null> {
  const rows = (await getDb().execute(sql`
    SELECT node_id FROM probe_leases WHERE lease_key = ${leaseKey}
  `)) as unknown as Array<{ node_id: string }>;
  return rows[0]?.node_id ?? null;
}

async function readExpiresAt(leaseKey: string): Promise<Date> {
  const rows = (await getDb().execute(sql`
    SELECT expires_at FROM probe_leases WHERE lease_key = ${leaseKey}
  `)) as unknown as Array<{ expires_at: string | Date }>;
  return new Date(rows[0]!.expires_at);
}
