import { sql } from 'drizzle-orm';
import { getDb } from '@fau/db';
import {
  loadOfficialStatusHistory,
  loadOfficialStatusOverview,
  type OfficialOverallStatus,
} from './official-status';
import type {
  AnnouncementDto,
  ComponentDto,
  ComponentStatus,
  GroupDto,
  IncidentDto,
  IncidentUpdateDto,
  MaintenanceDto,
  OfficialOverall,
  OfficialSourceDto,
  StatusResponse,
} from './types';

/**
 * 把单条原始 probe 状态映射为对外组件状态。
 * 'down' 与 'timeout' 都视为组件 down；调度层 / 通知层再做"连续 2 次失败"防抖。
 */
function mapProbeToComponentStatus(raw: string | null, inMaintenance: boolean): ComponentStatus {
  if (inMaintenance) return 'maintenance';
  if (!raw) return 'unknown';
  if (raw === 'ok') return 'operational';
  if (raw === 'degraded') return 'degraded';
  if (raw === 'down' || raw === 'timeout') return 'major_outage';
  return 'unknown';
}

/**
 * 进行中事件 impact → 组件展示状态（覆盖探测原始状态）。
 * none 不覆盖（返回 null）。
 */
function incidentImpactToStatus(impact: string): ComponentStatus | null {
  if (impact === 'critical') return 'major_outage';
  if (impact === 'major') return 'partial_outage';
  if (impact === 'minor') return 'degraded';
  return null;
}

/** 组件状态严重度排序，用于多事件覆盖时取最严重。 */
const STATUS_SEVERITY: Record<ComponentStatus, number> = {
  operational: 0,
  maintenance: 1,
  unknown: 2,
  degraded: 3,
  partial_outage: 4,
  major_outage: 5,
};

function inferOverallStatus(components: ComponentDto[]): ComponentStatus {
  if (components.length === 0) return 'operational';
  let anyDegraded = false;
  let anyOutage = false;
  let allOutage = true;
  let anyMaintenance = false;
  let anyKnown = false;
  let nonMaintenanceCount = 0;
  for (const c of components) {
    if (c.status === 'maintenance') {
      anyMaintenance = true;
      continue;
    }
    nonMaintenanceCount += 1;
    if (c.status === 'unknown') continue;
    anyKnown = true;
    if (c.status === 'major_outage' || c.status === 'partial_outage') {
      anyOutage = true;
    } else {
      allOutage = false;
    }
    if (c.status === 'degraded') anyDegraded = true;
  }
  if (nonMaintenanceCount === 0) {
    return anyMaintenance ? 'maintenance' : 'operational';
  }
  if (!anyKnown) return 'unknown';
  if (anyOutage) return allOutage ? 'major_outage' : 'partial_outage';
  if (anyDegraded) return 'degraded';
  return 'operational';
}

interface ConfigRow {
  config_id: number;
  display_name: string;
  is_maintenance: boolean;
  poll_interval_seconds: number;
  model_name: string;
  group_id: number | null;
  group_slug: string | null;
  group_display_name: string | null;
  group_description: string | null;
  group_sort_order: number | null;
  config_sort_order: number;
  latest_status: string | null;
  latest_latency_ms: number | null;
  latest_checked_at: string | null;
  uptime_30d_total: number | null;
  uptime_30d_healthy: number | null;
}

interface DailyRow {
  config_id: number;
  day: string;
  total: number;
  healthy: number;
  down: number;
  avg_p50: number | null;
}

interface IncidentRow {
  id: number;
  title: string;
  status: string;
  impact: string;
  started_at: string;
  resolved_at: string | null;
}

interface IncidentUpdateRow {
  id: number;
  incident_id: number;
  status: string;
  body_md: string;
  created_at: string;
}

interface IncidentUpdateComponentRow {
  update_id: number;
  config_id: number;
  display_name: string;
}

interface MaintenanceRow {
  id: number;
  title: string;
  body_md: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
}

interface AnnouncementRow {
  id: number;
  body_md: string;
  level: string;
  starts_at: string;
  ends_at: string | null;
}

interface IncidentComponentRow {
  incident_id: number;
  config_id: number;
  display_name: string;
}

interface MaintenanceComponentRow {
  maintenance_id: number;
  config_id: number;
  display_name: string;
}

function toOfficialOverall(s: OfficialOverallStatus | string | null | undefined): OfficialOverall {
  if (!s) return 'unknown';
  if (
    s === 'operational' ||
    s === 'degraded' ||
    s === 'partial_outage' ||
    s === 'major_outage' ||
    s === 'maintenance' ||
    s === 'unknown'
  ) {
    return s;
  }
  return 'unknown';
}

export async function buildStatusResponse(): Promise<StatusResponse> {
  const db = getDb();

  // 1. configs + group + 最新探测 + 30d 可用率 + endpoint type + model name
  const configRows = (await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (config_id)
        config_id, status, latency_ms, checked_at
      FROM check_results
      ORDER BY config_id, checked_at DESC
    ),
    uptime_30d AS (
      SELECT
        config_id,
        SUM(total)::int AS total,
        SUM(ok_count + degraded_count)::int AS healthy
      FROM check_results_5min
      WHERE bucket_at >= NOW() - INTERVAL '30 days'
      GROUP BY config_id
    )
    SELECT
      cc.id AS config_id,
      cc.display_name,
      cc.is_maintenance,
      cc.poll_interval_seconds,
      cc.sort_order AS config_sort_order,
      m.model_name,
      g.id AS group_id,
      g.slug AS group_slug,
      g.display_name AS group_display_name,
      g.description AS group_description,
      g.sort_order AS group_sort_order,
      l.status::text AS latest_status,
      l.latency_ms AS latest_latency_ms,
      l.checked_at AS latest_checked_at,
      u.total AS uptime_30d_total,
      u.healthy AS uptime_30d_healthy
    FROM check_configs cc
    INNER JOIN models m ON m.id = cc.model_id
    LEFT JOIN groups g ON cc.group_id = g.id
    LEFT JOIN latest l ON l.config_id = cc.id
    LEFT JOIN uptime_30d u ON u.config_id = cc.id
    WHERE cc.enabled = true
    ORDER BY g.sort_order NULLS LAST, g.display_name NULLS LAST,
             cc.sort_order, cc.display_name
  `)) as unknown as ConfigRow[];

  // 2. 90 天每日聚合
  const dailyRows = (await db.execute(sql`
    SELECT
      config_id,
      to_char(date_trunc('day', bucket_at), 'YYYY-MM-DD') AS day,
      SUM(total)::int AS total,
      SUM(ok_count + degraded_count)::int AS healthy,
      SUM(down_count)::int AS down,
      ROUND(AVG(NULLIF(p50_ms, 0)))::int AS avg_p50
    FROM check_results_5min
    WHERE bucket_at >= NOW() - INTERVAL '90 days'
    GROUP BY config_id, date_trunc('day', bucket_at)
  `)) as unknown as DailyRow[];

  type DayAgg = { total: number; healthy: number; down: number; p50: number | null };
  const dailyByConfig = new Map<number, Map<string, DayAgg>>();
  for (const r of dailyRows) {
    const id = Number(r.config_id);
    if (!dailyByConfig.has(id)) dailyByConfig.set(id, new Map());
    dailyByConfig.get(id)!.set(r.day, {
      total: Number(r.total),
      healthy: Number(r.healthy),
      down: Number(r.down),
      p50: r.avg_p50 === null ? null : Number(r.avg_p50),
    });
  }

  // 3. 事件 + body_md + updates
  const incidentRows = (await db.execute(sql`
    SELECT id, title, status::text, impact::text, started_at, resolved_at
    FROM incidents
    WHERE is_public = true
      AND (status != 'resolved' OR started_at >= NOW() - INTERVAL '30 days')
    ORDER BY started_at DESC
  `)) as unknown as Array<IncidentRow>;

  // 也读 body_md（incidents 表本身没有 body_md；body 都在 updates 里。
  // 我们把"最早一条 update"作为 incident.bodyMd 的候选，否则保持 null。

  const incidentIds = incidentRows.map((r) => Number(r.id));

  const incidentComponents =
    incidentIds.length === 0
      ? []
      : ((await db.execute(sql`
          SELECT ic.incident_id, ic.config_id, cc.display_name
          FROM incident_components ic
          JOIN check_configs cc ON cc.id = ic.config_id
          WHERE ic.incident_id IN (${sql.join(
            incidentIds.map((id) => sql`${id}`),
            sql`, `,
          )})
        `)) as unknown as IncidentComponentRow[]);

  const incidentUpdateRows: IncidentUpdateRow[] =
    incidentIds.length === 0
      ? []
      : ((await db.execute(sql`
          SELECT id, incident_id, status::text, body_md, created_at
          FROM incident_updates
          WHERE incident_id IN (${sql.join(
            incidentIds.map((id) => sql`${id}`),
            sql`, `,
          )})
          ORDER BY created_at DESC
        `)) as unknown as IncidentUpdateRow[]);

  // 每条更新发布时的受影响组件快照
  const incidentUpdateComponents =
    incidentIds.length === 0
      ? []
      : ((await db.execute(sql`
          SELECT iuc.update_id, iuc.config_id, cc.display_name
          FROM incident_update_components iuc
          JOIN incident_updates iu ON iu.id = iuc.update_id
          JOIN check_configs cc ON cc.id = iuc.config_id
          WHERE iu.incident_id IN (${sql.join(
            incidentIds.map((id) => sql`${id}`),
            sql`, `,
          )})
        `)) as unknown as IncidentUpdateComponentRow[]);

  // 4. 维护 + 关联组件
  // notify_lead_minutes 决定 scheduled 维护对外可见的提前量:
  //   - in_progress 不论何时都展示
  //   - scheduled 仅当离开始时间 ≤ notify_lead_minutes 分钟时才展示
  const maintRows = (await db.execute(sql`
    SELECT id, title, body_md, scheduled_start, scheduled_end, status::text
    FROM maintenances
    WHERE status IN ('scheduled', 'in_progress')
      AND scheduled_end >= NOW()
      AND (
        status = 'in_progress'
        OR scheduled_start <= NOW() + make_interval(mins => notify_lead_minutes)
      )
    ORDER BY scheduled_start ASC
  `)) as unknown as MaintenanceRow[];

  const maintComponents =
    maintRows.length === 0
      ? []
      : ((await db.execute(sql`
          SELECT mc.maintenance_id, mc.config_id, cc.display_name
          FROM maintenance_components mc
          JOIN check_configs cc ON cc.id = mc.config_id
          WHERE mc.maintenance_id IN (${sql.join(
            maintRows.map((r) => sql`${Number(r.id)}`),
            sql`, `,
          )})
        `)) as unknown as MaintenanceComponentRow[]);

  // 5. 公告
  const announcementRows = (await db.execute(sql`
    SELECT id, body_md, level::text, starts_at, ends_at
    FROM announcements
    WHERE enabled = true
      AND starts_at <= NOW()
      AND (ends_at IS NULL OR ends_at > NOW())
    ORDER BY starts_at DESC
  `)) as unknown as AnnouncementRow[];

  // 6. 官方状态镜像（每镜像当前状态 + 24h sparkline）
  const officialOverview = await loadOfficialStatusOverview();
  const officialSources: OfficialSourceDto[] = await Promise.all(
    officialOverview
      .filter((r) => r.enabled)
      .map(async (r) => {
        const hist = await loadOfficialStatusHistory(r.mirrorId, 24);
        return {
          id: r.mirrorId,
          name: r.name,
          type: 'mirror',
          status: toOfficialOverall(r.latestStatus),
          label: null,
          updatedAt: r.latestFetchedAt,
          url: r.statusUrl,
          sparkline: hist.map((p) => toOfficialOverall(p.overallStatus)),
        };
      }),
  );

  // —— 组装 components ——
  const todayUtc = new Date();
  const ninetyDays: string[] = [];
  for (let i = 89; i >= 0; i -= 1) {
    const d = new Date(
      Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate() - i),
    );
    ninetyDays.push(d.toISOString().slice(0, 10));
  }

  const componentsByGroup = new Map<string, ComponentDto[]>();
  const groupMeta = new Map<
    string,
    {
      id: number | null;
      slug: string | null;
      displayName: string;
      description: string | null;
      sortOrder: number;
    }
  >();
  // 同时建立 configId → component 索引，方便 incidents/maintenances 反查 status
  const componentByConfigId = new Map<number, ComponentDto>();

  for (const r of configRows) {
    const inMaintenance = Boolean(r.is_maintenance);
    const compStatus = mapProbeToComponentStatus(r.latest_status, inMaintenance);
    const totalP = Number(r.uptime_30d_total ?? 0);
    const healthyP = Number(r.uptime_30d_healthy ?? 0);
    const uptime30d = totalP > 0 ? Number(((healthyP / totalP) * 100).toFixed(2)) : null;

    const dailyMap = dailyByConfig.get(Number(r.config_id));
    const daily90d = ninetyDays.map((day) => {
      const d = dailyMap?.get(day);
      if (!d || d.total === 0) {
        return { date: day, uptime: null, total: 0, down: 0, p50Ms: null };
      }
      const uptime = Number(((d.healthy / d.total) * 100).toFixed(2));
      return { date: day, uptime, total: d.total, down: d.down, p50Ms: d.p50 };
    });

    const comp: ComponentDto = {
      id: Number(r.config_id),
      name: r.display_name,
      status: compStatus,
      model: r.model_name ?? '',
      latencyMs: r.latest_latency_ms === null ? null : Number(r.latest_latency_ms),
      uptime30d,
      daily90d,
      lastCheckedAt: r.latest_checked_at ? new Date(r.latest_checked_at).toISOString() : null,
      inMaintenance,
      intervalSec: Number(r.poll_interval_seconds ?? 60),
    };

    const key = r.group_id === null ? '__ungrouped__' : String(r.group_id);
    if (!groupMeta.has(key)) {
      groupMeta.set(key, {
        id: r.group_id === null ? null : Number(r.group_id),
        slug: r.group_slug,
        displayName: r.group_display_name ?? '其它',
        description: r.group_description,
        sortOrder: Number(r.group_sort_order ?? 999_999),
      });
      componentsByGroup.set(key, []);
    }
    componentsByGroup.get(key)!.push(comp);
    componentByConfigId.set(comp.id, comp);
  }

  // —— 事件状态优先级：进行中的公开事件覆盖其受影响探测组件的展示状态 ——
  // impact 映射为组件状态（critical→major_outage、major→partial_outage、minor→degraded），
  // 多事件取最严重；维护中的组件不被覆盖（维护是主动状态）。
  const incidentStatusOverride = new Map<number, ComponentStatus>();
  const activeIncidentIds = new Set(
    incidentRows.filter((r) => r.status !== 'resolved').map((r) => Number(r.id)),
  );
  for (const ic of incidentComponents) {
    const incidentId = Number(ic.incident_id);
    if (!activeIncidentIds.has(incidentId)) continue;
    const inc = incidentRows.find((r) => Number(r.id) === incidentId);
    if (!inc) continue;
    const mapped = incidentImpactToStatus(inc.impact);
    if (!mapped) continue;
    const configId = Number(ic.config_id);
    const prev = incidentStatusOverride.get(configId);
    if (!prev || STATUS_SEVERITY[mapped] > STATUS_SEVERITY[prev]) {
      incidentStatusOverride.set(configId, mapped);
    }
  }
  for (const [configId, overrideStatus] of incidentStatusOverride) {
    const comp = componentByConfigId.get(configId);
    if (comp && !comp.inMaintenance) comp.status = overrideStatus;
  }

  const groups: GroupDto[] = Array.from(groupMeta.entries())
    .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
    .map(([_key, meta]) => ({
      id: meta.id,
      slug: meta.slug,
      displayName: meta.displayName,
      description: meta.description,
      components: componentsByGroup.get(_key) ?? [],
    }));

  const allComponents = groups.flatMap((g) => g.components);
  const overallStatus = inferOverallStatus(allComponents);

  // —— Incidents 装配 ——
  const incCompMap = new Map<
    number,
    Array<{ id: number; name: string; status?: ComponentStatus }>
  >();
  for (const ic of incidentComponents) {
    const arr = incCompMap.get(Number(ic.incident_id)) ?? [];
    const comp = componentByConfigId.get(Number(ic.config_id));
    arr.push({
      id: Number(ic.config_id),
      name: ic.display_name,
      status: comp?.status,
    });
    incCompMap.set(Number(ic.incident_id), arr);
  }

  // update_id → 该条更新的受影响组件快照
  const compsByUpdateId = new Map<number, Array<{ id: number; name: string }>>();
  for (const uc of incidentUpdateComponents) {
    const arr = compsByUpdateId.get(Number(uc.update_id)) ?? [];
    arr.push({ id: Number(uc.config_id), name: uc.display_name });
    compsByUpdateId.set(Number(uc.update_id), arr);
  }

  const updatesByIncident = new Map<number, IncidentUpdateDto[]>();
  for (const u of incidentUpdateRows) {
    const id = Number(u.incident_id);
    const arr = updatesByIncident.get(id) ?? [];
    arr.push({
      status: u.status as IncidentDto['status'],
      at: new Date(u.created_at).toISOString(),
      body: u.body_md,
      affected: compsByUpdateId.get(Number(u.id)) ?? [],
    });
    updatesByIncident.set(id, arr);
  }

  const allIncidents: IncidentDto[] = incidentRows.map((r) => {
    const id = Number(r.id);
    const updates = updatesByIncident.get(id) ?? [];
    // 按时间正序，最早一条作为 bodyMd 候选
    const sortedAsc = [...updates].sort((a, b) => a.at.localeCompare(b.at));
    const bodyMd = sortedAsc.length > 0 ? sortedAsc[0]!.body : null;
    return {
      id,
      title: r.title,
      status: r.status as IncidentDto['status'],
      impact: r.impact as IncidentDto['impact'],
      startedAt: new Date(r.started_at).toISOString(),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
      bodyMd,
      affectedComponents: incCompMap.get(id) ?? [],
      updates,
    };
  });
  const activeIncidents = allIncidents.filter((i) => i.status !== 'resolved');
  const recentIncidents = allIncidents;

  // —— Maintenances 装配 ——
  const maintCompMap = new Map<
    number,
    Array<{ id: number; name: string; status?: ComponentStatus }>
  >();
  for (const mc of maintComponents) {
    const arr = maintCompMap.get(Number(mc.maintenance_id)) ?? [];
    const comp = componentByConfigId.get(Number(mc.config_id));
    arr.push({ id: Number(mc.config_id), name: mc.display_name, status: comp?.status });
    maintCompMap.set(Number(mc.maintenance_id), arr);
  }
  const scheduledMaintenances: MaintenanceDto[] = maintRows.map((r) => ({
    id: Number(r.id),
    title: r.title,
    bodyMd: r.body_md,
    scheduledStart: new Date(r.scheduled_start).toISOString(),
    scheduledEnd: new Date(r.scheduled_end).toISOString(),
    status: r.status as MaintenanceDto['status'],
    affectedComponents: maintCompMap.get(Number(r.id)) ?? [],
  }));

  const announcements: AnnouncementDto[] = announcementRows.map((r) => ({
    id: Number(r.id),
    bodyMd: r.body_md,
    level: r.level as AnnouncementDto['level'],
    startsAt: new Date(r.starts_at).toISOString(),
    endsAt: r.ends_at ? new Date(r.ends_at).toISOString() : null,
  }));

  const now = new Date().toISOString();
  return {
    overallStatus,
    updatedAt: now,
    now,
    groups,
    activeIncidents,
    scheduledMaintenances,
    announcements,
    recentIncidents,
    officialSources,
  };
}
