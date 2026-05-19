/**
 * 公开 API 响应类型 — 与 /api/v1/* 严格对应。
 */

export type ComponentStatus =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage'
  | 'maintenance'
  | 'unknown';

export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export type IncidentImpact = 'none' | 'minor' | 'major' | 'critical';
export type AnnouncementLevel = 'info' | 'warning' | 'error';

export type OfficialOverall =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage'
  | 'maintenance'
  | 'unknown';

export interface DailyStat {
  /** YYYY-MM-DD（UTC） */
  date: string;
  /** 0~100，保留两位小数；null = 当天无数据 */
  uptime: number | null;
  /** 当天累计探测次数 */
  total: number;
  /** 当天故障 + 超时次数 */
  down: number;
  /** 当天延迟 P50 中位（ms），null = 无数据 */
  p50Ms: number | null;
}

export interface ComponentDto {
  id: number;
  name: string;
  status: ComponentStatus;
  /** 模型名（如 gpt-4o-mini） */
  model: string;
  /** 最近一次探测的端到端延迟，单位 ms */
  latencyMs: number | null;
  /** 30 天可用率（0~100，保留两位小数） */
  uptime30d: number | null;
  /** 最近 90 天每日统计，从最早 → 最近，固定 90 个元素 */
  daily90d: DailyStat[];
  /** 最近探测时间（ISO） */
  lastCheckedAt: string | null;
  /** 是否处于人工维护标记 */
  inMaintenance: boolean;
  /** 该组件的探测间隔（秒），供公开页显示 "每 N 秒" 标签。 */
  intervalSec: number;
}

export interface GroupDto {
  id: number | null; // null = 未分组的伪 group
  slug: string | null;
  displayName: string;
  description: string | null;
  components: ComponentDto[];
}

export interface IncidentUpdateDto {
  status: IncidentStatus;
  /** ISO */
  at: string;
  body: string;
  /** 该条更新发布时的受影响组件快照。 */
  affected: Array<{ id: number; name: string }>;
}

export interface IncidentDto {
  id: number;
  title: string;
  status: IncidentStatus;
  impact: IncidentImpact;
  startedAt: string;
  resolvedAt: string | null;
  bodyMd: string | null;
  affectedComponents: Array<{
    id: number;
    name: string;
    status?: ComponentStatus;
  }>;
  updates: IncidentUpdateDto[];
}

export interface MaintenanceDto {
  id: number;
  title: string;
  bodyMd: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  affectedComponents: Array<{ id: number; name: string; status?: ComponentStatus }>;
}

export interface AnnouncementDto {
  id: number;
  bodyMd: string;
  level: AnnouncementLevel;
  startsAt: string;
  endsAt: string | null;
}

export interface OfficialSourceDto {
  id: number;
  /** 镜像显示名 */
  name: string;
  /** 镜像类型标签，固定为 'mirror' */
  type: string;
  status: OfficialOverall;
  /** 标签（来自 status page label，可空） */
  label: string | null;
  /** 镜像快照拉取时间（ISO），null = 还没拉过 */
  updatedAt: string | null;
  /** 跳转的官方 status URL */
  url: string | null;
  /** 24h sparkline，按时间升序的状态序列；空数组表示无数据 */
  sparkline: OfficialOverall[];
}

export interface StatusResponse {
  overallStatus: ComponentStatus;
  /** 整体状态计算时刻（= now，与 updatedAt 同义保留向后兼容） */
  updatedAt: string;
  /** 显式的"now"字段，方便公开页 hero 与 timeAgo 计算 */
  now: string;
  groups: GroupDto[];
  activeIncidents: IncidentDto[];
  scheduledMaintenances: MaintenanceDto[];
  announcements: AnnouncementDto[];
  /** 最近 30 天的事件（含进行中 + 已解决），按 startedAt DESC */
  recentIncidents: IncidentDto[];
  /** 官方状态镜像汇总 */
  officialSources: OfficialSourceDto[];
}
