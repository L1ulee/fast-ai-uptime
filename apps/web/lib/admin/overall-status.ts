import { sql } from 'drizzle-orm';
import { getDb } from '@fau/db';

export type AdminLiveStatus =
  | { kind: 'operational'; pendingIncidents: 0; pendingMaintenances: 0 }
  | { kind: 'busy'; pendingIncidents: number; pendingMaintenances: number };

export interface AdminNavCounts {
  configs: number;
  providers: number;
  models: number;
  groups: number;
  incidents: number;
  maintenances: number;
  webhooks: number;
}

/** 一次 SQL 拿齐侧栏徽章数据，避免每个菜单项各查一次。 */
export async function getAdminNavCounts(): Promise<AdminNavCounts> {
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM check_configs) AS configs,
      (SELECT COUNT(*)::int FROM providers) AS providers,
      (SELECT COUNT(*)::int FROM models) AS models,
      (SELECT COUNT(*)::int FROM groups) AS groups,
      (SELECT COUNT(*)::int FROM incidents WHERE status != 'resolved') AS incidents,
      (SELECT COUNT(*)::int FROM maintenances
        WHERE status IN ('scheduled','in_progress') AND scheduled_end > NOW()) AS maintenances,
      (SELECT COUNT(*)::int FROM subscriptions) AS webhooks
  `)) as unknown as Array<AdminNavCounts>;
  const r = rows[0] ?? {
    configs: 0,
    providers: 0,
    models: 0,
    groups: 0,
    incidents: 0,
    maintenances: 0,
    webhooks: 0,
  };
  return {
    configs: Number(r.configs),
    providers: Number(r.providers),
    models: Number(r.models),
    groups: Number(r.groups),
    incidents: Number(r.incidents),
    maintenances: Number(r.maintenances),
    webhooks: Number(r.webhooks),
  };
}

/**
 * 简版系统健康概览：仅基于"是否有进行中事件 / 未结束维护"判断后台 header chip 颜色。
 */
export async function getAdminLiveStatus(): Promise<AdminLiveStatus> {
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM incidents WHERE status != 'resolved') AS inc,
      (SELECT COUNT(*)::int FROM maintenances
        WHERE status IN ('scheduled','in_progress') AND scheduled_end > NOW()) AS maint
  `)) as unknown as Array<{ inc: number; maint: number }>;
  const inc = Number(rows[0]?.inc ?? 0);
  const maint = Number(rows[0]?.maint ?? 0);
  if (inc === 0 && maint === 0) {
    return { kind: 'operational', pendingIncidents: 0, pendingMaintenances: 0 };
  }
  return { kind: 'busy', pendingIncidents: inc, pendingMaintenances: maint };
}
