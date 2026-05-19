import { sql } from 'drizzle-orm';
import { getDb } from '@fau/db';
import { enqueueWebhookEvent } from '@/lib/notify/webhook';
import { probeEnv } from './env';
import { releaseLease } from './lease';
import { withLease } from './with-lease';

const LEASE_KEY = 'maintenance-scanner';
const TICK_MS = 60_000; // 每分钟一次
const LEASE_TTL_SECONDS = 120;

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = false;

/**
 * 维护状态自动转换：
 *   scheduled  → in_progress   when scheduled_start ≤ NOW < scheduled_end
 *   in_progress → completed    when scheduled_end ≤ NOW
 *
 * 取消（cancelled）由管理员手动设置；本扫描不会触碰 cancelled 行。
 */
async function tick(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    await withLease(LEASE_KEY, probeEnv.nodeId, LEASE_TTL_SECONDS, async () => {
      const db = getDb();
      // 单事务覆盖 2 种转换，避免并发半步状态。
      // 1) scheduled / in_progress → completed（窗口已结束）
      // 2) scheduled → in_progress（处于窗口内）
      // completed 在前确保"完全过期的 scheduled"也能直接转 completed。
      const toEmit: Array<{
        event: 'maintenance.started' | 'maintenance.completed';
        id: number;
      }> = [];
      await db.transaction(async (tx) => {
        const completed = (await tx.execute(sql`
          UPDATE maintenances
          SET status = 'completed', updated_at = NOW()
          WHERE status IN ('scheduled', 'in_progress')
            AND scheduled_end <= NOW()
          RETURNING id
        `)) as unknown as Array<{ id: number }>;
        const promoted = (await tx.execute(sql`
          UPDATE maintenances
          SET status = 'in_progress', updated_at = NOW()
          WHERE status = 'scheduled'
            AND scheduled_start <= NOW()
            AND scheduled_end > NOW()
          RETURNING id
        `)) as unknown as Array<{ id: number }>;
        if (promoted.length > 0 || completed.length > 0) {
          console.log(`[maint-scanner] promoted=${promoted.length} completed=${completed.length}`);
        }
        for (const r of completed)
          toEmit.push({ event: 'maintenance.completed', id: Number(r.id) });
        for (const r of promoted) toEmit.push({ event: 'maintenance.started', id: Number(r.id) });
      });
      // 仅在事务成功提交后投递 webhook（事务回滚 → 抛出 → 不会到这里）。
      // enqueueWebhookEvent 走独立连接，原先放在事务内会出现"回滚后留下 phantom 投递"。
      for (const e of toEmit) {
        await enqueueWebhookEvent(e.event, { id: e.id });
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[maint-scanner] ${msg}`);
  } finally {
    running = false;
  }
}

export function startMaintenanceScanner(): void {
  if (timer || stopped) return;
  // 启动延迟 15s（让 DB 与其它 worker 先就绪）
  setTimeout(() => {
    if (stopped) return;
    timer = setInterval(() => void tick(), TICK_MS);
    void tick();
  }, 15_000);
  console.log('[maint-scanner] started (tick=60s)');
}

export async function stopMaintenanceScanner(): Promise<void> {
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
