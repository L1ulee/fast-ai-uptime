import { eq, sql } from 'drizzle-orm';
import {
  getDb,
  incidentComponents,
  incidentUpdateComponents,
  incidentUpdates,
  incidents,
} from '@fau/db';
import { logEvent } from '@/lib/admin/log';
import { enqueueWebhookEvent } from '@/lib/notify/webhook';
import { probeEnv } from './env';
import { releaseLease } from './lease';
import { withLease } from './with-lease';

const LEASE_KEY = 'incident-scanner';
const TICK_MS = 60_000; // 每分钟一次
const LEASE_TTL_SECONDS = 120;
/** 连续多少次同类结果才触发状态判定（防抖）。 */
const CONSECUTIVE_THRESHOLD = 2;
/** 自动事件被解决后，多少分钟内不对同组件重建（防抖动 + 尊重人工提前解决）。 */
const RESOLVE_COOLDOWN_MINUTES = 15;

type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
type IncidentImpact = 'none' | 'minor' | 'major' | 'critical';
type ConfigHealth = 'outage' | 'degraded' | 'healthy';

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = false;

interface RecentRow {
  config_id: number;
  display_name: string;
  status: string;
  rn: number;
}

interface OpenAutoRow {
  id: number;
  auto_config_id: number;
  impact: string;
  status: string;
}

/** 由最近 N 条探测结果判定组件健康度；信号不足（结果 < 阈值或不连续同类）返回 null。 */
function classifyHealth(statuses: string[]): ConfigHealth | null {
  if (statuses.length < CONSECUTIVE_THRESHOLD) return null;
  const recent = statuses.slice(0, CONSECUTIVE_THRESHOLD);
  if (recent.every((s) => s === 'down' || s === 'timeout')) return 'outage';
  if (recent.every((s) => s === 'degraded')) return 'degraded';
  if (recent.every((s) => s === 'ok')) return 'healthy';
  return null;
}

function impactForHealth(health: 'outage' | 'degraded'): IncidentImpact {
  return health === 'outage' ? 'critical' : 'minor';
}

/**
 * 自动事件扫描器：探测组件连续异常 → 自动建事件；恢复 → 自动解决；
 * 影响等级随探测状态升降级。与人工事件互斥（组件已被任意进行中事件覆盖则不重复建）。
 */
async function tick(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    await withLease(LEASE_KEY, probeEnv.nodeId, LEASE_TTL_SECONDS, async () => {
      const db = getDb();

      // 1. 每个启用、非维护组件的最近 N 条探测结果
      const recentRows = (await db.execute(sql`
        SELECT config_id, display_name, status, rn FROM (
          SELECT cr.config_id,
                 cc.display_name,
                 cr.status::text AS status,
                 ROW_NUMBER() OVER (PARTITION BY cr.config_id ORDER BY cr.checked_at DESC) AS rn
          FROM check_results cr
          JOIN check_configs cc ON cc.id = cr.config_id
          WHERE cc.enabled = true AND cc.is_maintenance = false
        ) t
        WHERE rn <= ${CONSECUTIVE_THRESHOLD}
      `)) as unknown as RecentRow[];

      const byConfig = new Map<number, { name: string; statuses: string[] }>();
      for (const r of recentRows) {
        const id = Number(r.config_id);
        const entry = byConfig.get(id) ?? { name: r.display_name, statuses: [] };
        entry.statuses[Number(r.rn) - 1] = r.status;
        byConfig.set(id, entry);
      }

      // 2. 未关闭的自动事件（按追踪的组件索引）
      const openAutoRows = (await db.execute(sql`
        SELECT id, auto_config_id, impact::text AS impact, status::text AS status
        FROM incidents
        WHERE source = 'auto' AND auto_config_id IS NOT NULL AND status != 'resolved'
      `)) as unknown as OpenAutoRow[];
      const openAutoByConfig = new Map<number, OpenAutoRow>();
      for (const r of openAutoRows) openAutoByConfig.set(Number(r.auto_config_id), r);

      // 3. 已被任意进行中事件覆盖的组件（防与人工事件重复）
      const coveredRows = (await db.execute(sql`
        SELECT DISTINCT ic.config_id
        FROM incident_components ic
        JOIN incidents i ON i.id = ic.incident_id
        WHERE i.status != 'resolved'
      `)) as unknown as Array<{ config_id: number }>;
      const coveredConfigs = new Set(coveredRows.map((r) => Number(r.config_id)));

      // 4. 近 N 分钟内被自动解决过的组件（冷却，避免抖动刷屏）
      const cooldownRows = (await db.execute(sql`
        SELECT DISTINCT auto_config_id
        FROM incidents
        WHERE source = 'auto' AND auto_config_id IS NOT NULL
          AND status = 'resolved'
          AND resolved_at >= NOW() - make_interval(mins => ${RESOLVE_COOLDOWN_MINUTES})
      `)) as unknown as Array<{ auto_config_id: number }>;
      const cooldownConfigs = new Set(cooldownRows.map((r) => Number(r.auto_config_id)));

      // 副作用（webhook / 日志）在事务提交后再执行
      const sideEffects: Array<() => Promise<void>> = [];

      for (const [configId, { name, statuses }] of byConfig) {
        const health = classifyHealth(statuses);
        if (!health) continue;
        const existing = openAutoByConfig.get(configId);

        if (health === 'healthy') {
          if (!existing) continue;
          // 自动解决
          await db.transaction(async (tx) => {
            await tx
              .update(incidents)
              .set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
              .where(eq(incidents.id, existing.id));
            const [upd] = await tx
              .insert(incidentUpdates)
              .values({
                incidentId: existing.id,
                status: 'resolved',
                impact: 'none',
                bodyMd: `探测组件「${name}」已连续 ${CONSECUTIVE_THRESHOLD} 次恢复正常，事件自动解决。`,
              })
              .returning({ id: incidentUpdates.id });
            await tx
              .insert(incidentUpdateComponents)
              .values({ updateId: upd!.id, configId })
              .onConflictDoNothing();
          });
          sideEffects.push(async () => {
            await enqueueWebhookEvent('incident.resolved', {
              id: existing.id,
              status: 'resolved',
              body: `探测组件「${name}」已恢复正常。`,
            });
            await logEvent({
              source: 'system',
              level: 'info',
              action: 'incident.auto_resolve',
              target: String(existing.id),
              message: `自动解决事件 #${existing.id}：「${name}」探测恢复`,
              meta: { configId },
            });
          });
          continue;
        }

        // health: outage | degraded
        const desiredImpact = impactForHealth(health);

        if (existing) {
          if ((existing.impact as IncidentImpact) === desiredImpact) continue;
          // 升级 / 降级
          const keepStatus = existing.status as IncidentStatus;
          await db.transaction(async (tx) => {
            await tx
              .update(incidents)
              .set({ impact: desiredImpact, updatedAt: new Date() })
              .where(eq(incidents.id, existing.id));
            const [upd] = await tx
              .insert(incidentUpdates)
              .values({
                incidentId: existing.id,
                status: keepStatus,
                impact: desiredImpact,
                bodyMd: `探测状态变化：影响等级调整为 ${desiredImpact}（探测连续 ${CONSECUTIVE_THRESHOLD} 次${
                  health === 'outage' ? '故障/超时' : '降级'
                }）。`,
              })
              .returning({ id: incidentUpdates.id });
            await tx
              .insert(incidentUpdateComponents)
              .values({ updateId: upd!.id, configId })
              .onConflictDoNothing();
          });
          sideEffects.push(async () => {
            await enqueueWebhookEvent('incident.updated', {
              id: existing.id,
              status: keepStatus,
              body: `影响等级调整为 ${desiredImpact}。`,
            });
            await logEvent({
              source: 'system',
              level: 'warn',
              action: 'incident.auto_escalate',
              target: String(existing.id),
              message: `自动事件 #${existing.id}「${name}」影响等级 → ${desiredImpact}`,
              meta: { configId, impact: desiredImpact },
            });
          });
          continue;
        }

        // 无开启事件 → 考虑新建
        if (coveredConfigs.has(configId)) continue; // 已被其它进行中事件覆盖
        if (cooldownConfigs.has(configId)) continue; // 冷却期内

        const title = `「${name}」探测异常`;
        const body = `探测组件「${name}」连续 ${CONSECUTIVE_THRESHOLD} 次${
          health === 'outage' ? '故障/超时' : '降级'
        }，已自动创建事件。`;
        let newId = 0;
        await db.transaction(async (tx) => {
          const [inc] = await tx
            .insert(incidents)
            .values({
              title,
              status: 'investigating',
              impact: desiredImpact,
              isPublic: true,
              source: 'auto',
              autoConfigId: configId,
            })
            .returning({ id: incidents.id });
          newId = inc!.id;
          await tx
            .insert(incidentComponents)
            .values({ incidentId: newId, configId })
            .onConflictDoNothing();
          const [upd] = await tx
            .insert(incidentUpdates)
            .values({
              incidentId: newId,
              status: 'investigating',
              impact: desiredImpact,
              bodyMd: body,
            })
            .returning({ id: incidentUpdates.id });
          await tx
            .insert(incidentUpdateComponents)
            .values({ updateId: upd!.id, configId })
            .onConflictDoNothing();
        });
        sideEffects.push(async () => {
          await enqueueWebhookEvent('incident.created', {
            id: newId,
            title,
            status: 'investigating',
            impact: desiredImpact,
            isPublic: true,
            affectedComponentIds: [configId],
          });
          await logEvent({
            source: 'system',
            level: 'warn',
            action: 'incident.auto_create',
            target: String(newId),
            message: `自动创建事件 #${newId}：${title}`,
            meta: { configId, impact: desiredImpact, health },
          });
        });
      }

      for (const fn of sideEffects) {
        await fn();
      }
      if (sideEffects.length > 0) {
        console.log(`[incident-scanner] applied ${sideEffects.length} transition(s)`);
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[incident-scanner] ${msg}`);
  } finally {
    running = false;
  }
}

export function startIncidentScanner(): void {
  if (timer || stopped) return;
  // 启动延迟 20s（让 DB 与探测调度器先就绪、积累探测结果）
  setTimeout(() => {
    if (stopped) return;
    timer = setInterval(() => void tick(), TICK_MS);
    void tick();
  }, 20_000);
  console.log('[incident-scanner] started (tick=60s)');
}

export async function stopIncidentScanner(): Promise<void> {
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
