import { sql } from 'drizzle-orm';
import { getDb } from '@fau/db';
import type { ComponentStatus, IncidentDto, IncidentUpdateDto, MaintenanceDto } from './types';

interface IncidentRangeRow {
  id: number;
  title: string;
  status: string;
  impact: string;
  started_at: string;
  resolved_at: string | null;
}

interface MaintRangeRow {
  id: number;
  title: string;
  body_md: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
}

interface UpdateRow {
  id: number;
  incident_id: number;
  status: string;
  body_md: string;
  created_at: string;
}

interface IncCompRow {
  incident_id: number;
  config_id: number;
  display_name: string;
}

interface IncUpdCompRow {
  update_id: number;
  config_id: number;
  display_name: string;
}

interface MaintCompRow {
  maintenance_id: number;
  config_id: number;
  display_name: string;
}

/**
 * Window 起止：以 monthOffset 为基（0 = 最近 3 个月窗口），返回 ISO 范围。
 *  - end 为窗口最末月的下一个月 1 号（exclusive）
 *  - start 为窗口最早月的 1 号（inclusive）
 */
export function monthsRange(monthOffset: number): {
  start: Date;
  end: Date;
  months: Date[];
} {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthOffset * 3, 1));
  const months: Date[] = [];
  for (let i = 2; i >= 0; i -= 1) {
    months.push(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1)));
  }
  const start = months[0]!;
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));
  return { start, end, months };
}

export async function loadIncidentsForRange(start: Date, end: Date): Promise<IncidentDto[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT id, title, status::text, impact::text, started_at, resolved_at
    FROM incidents
    WHERE is_public = true
      AND started_at >= ${start.toISOString()}::timestamptz
      AND started_at < ${end.toISOString()}::timestamptz
    ORDER BY started_at DESC
  `)) as unknown as IncidentRangeRow[];

  if (rows.length === 0) return [];
  const ids = rows.map((r) => Number(r.id));

  const [updates, comps, updComps] = await Promise.all([
    db.execute(sql`
      SELECT id, incident_id, status::text, body_md, created_at
      FROM incident_updates
      WHERE incident_id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
      ORDER BY created_at DESC
    `) as unknown as Promise<UpdateRow[]>,
    db.execute(sql`
      SELECT ic.incident_id, ic.config_id, cc.display_name
      FROM incident_components ic
      JOIN check_configs cc ON cc.id = ic.config_id
      WHERE ic.incident_id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
    `) as unknown as Promise<IncCompRow[]>,
    db.execute(sql`
      SELECT iuc.update_id, iuc.config_id, cc.display_name
      FROM incident_update_components iuc
      JOIN incident_updates iu ON iu.id = iuc.update_id
      JOIN check_configs cc ON cc.id = iuc.config_id
      WHERE iu.incident_id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
    `) as unknown as Promise<IncUpdCompRow[]>,
  ]);

  const compsByUpdateId = new Map<number, Array<{ id: number; name: string }>>();
  for (const uc of updComps) {
    const uid = Number(uc.update_id);
    const arr = compsByUpdateId.get(uid) ?? [];
    arr.push({ id: Number(uc.config_id), name: uc.display_name });
    compsByUpdateId.set(uid, arr);
  }

  const updByInc = new Map<number, IncidentUpdateDto[]>();
  for (const u of updates) {
    const id = Number(u.incident_id);
    const arr = updByInc.get(id) ?? [];
    arr.push({
      status: u.status as IncidentDto['status'],
      at: new Date(u.created_at).toISOString(),
      body: u.body_md,
      affected: compsByUpdateId.get(Number(u.id)) ?? [],
    });
    updByInc.set(id, arr);
  }
  const compByInc = new Map<
    number,
    Array<{ id: number; name: string; status?: ComponentStatus }>
  >();
  for (const c of comps) {
    const id = Number(c.incident_id);
    const arr = compByInc.get(id) ?? [];
    arr.push({ id: Number(c.config_id), name: c.display_name });
    compByInc.set(id, arr);
  }

  return rows.map((r) => {
    const id = Number(r.id);
    const u = updByInc.get(id) ?? [];
    const sortedAsc = [...u].sort((a, b) => a.at.localeCompare(b.at));
    return {
      id,
      title: r.title,
      status: r.status as IncidentDto['status'],
      impact: r.impact as IncidentDto['impact'],
      startedAt: new Date(r.started_at).toISOString(),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
      bodyMd: sortedAsc.length > 0 ? sortedAsc[0]!.body : null,
      affectedComponents: compByInc.get(id) ?? [],
      updates: u,
    };
  });
}

export async function loadMaintenancesForRange(start: Date, end: Date): Promise<MaintenanceDto[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT id, title, body_md, scheduled_start, scheduled_end, status::text
    FROM maintenances
    WHERE scheduled_start >= ${start.toISOString()}::timestamptz
      AND scheduled_start < ${end.toISOString()}::timestamptz
    ORDER BY scheduled_start DESC
  `)) as unknown as MaintRangeRow[];

  if (rows.length === 0) return [];
  const ids = rows.map((r) => Number(r.id));

  const comps = (await db.execute(sql`
    SELECT mc.maintenance_id, mc.config_id, cc.display_name
    FROM maintenance_components mc
    JOIN check_configs cc ON cc.id = mc.config_id
    WHERE mc.maintenance_id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})
  `)) as unknown as MaintCompRow[];

  const compByMaint = new Map<number, Array<{ id: number; name: string }>>();
  for (const c of comps) {
    const id = Number(c.maintenance_id);
    const arr = compByMaint.get(id) ?? [];
    arr.push({ id: Number(c.config_id), name: c.display_name });
    compByMaint.set(id, arr);
  }

  return rows.map((r) => ({
    id: Number(r.id),
    title: r.title,
    bodyMd: r.body_md,
    scheduledStart: new Date(r.scheduled_start).toISOString(),
    scheduledEnd: new Date(r.scheduled_end).toISOString(),
    status: r.status as MaintenanceDto['status'],
    affectedComponents: compByMaint.get(Number(r.id)) ?? [],
  }));
}

/** 把月份 Date 格式化成本地化月份标签。lang='en' -> "May 2026" / 'zh' -> "2026年5月" */
export function monthLabel(d: Date, lang: 'zh' | 'en' = 'en'): string {
  const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
  return d.toLocaleString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export function monthFull(d: Date, lang: 'zh' | 'en' = 'en'): string {
  const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
  return d.toLocaleString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
// 旧别名保留以减少调用方改动
export const monthLabelEn = (d: Date) => monthLabel(d, 'en');
export const monthFullEn = (d: Date) => monthFull(d, 'en');

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function bucketByMonth<T extends { startedAt?: string; scheduledStart?: string }>(
  items: T[],
  months: Date[],
): Array<{ date: Date; ym: string; items: T[] }> {
  return months.map((d) => {
    const ym = monthKey(d);
    return {
      date: d,
      ym,
      items: items.filter((it) => {
        const s = (it.startedAt ?? it.scheduledStart ?? '').slice(0, 7);
        return s === ym;
      }),
    };
  });
}
