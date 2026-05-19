/**
 * Aggregation queries that back the 1:1-replicated admin pages.
 * Each function maps roughly to one design-source data shape (window.FAU_MOCK.x).
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@fau/db';
import { OFFICIAL_STATUS_LABEL, type OfficialOverallStatus } from './official-status-shared';

function parseHeaderPairsForUi(value: unknown): Array<{ key: string; val: string }> {
  if (Array.isArray(value)) {
    const out: Array<{ key: string; val: string }> = [];
    for (const item of value) {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (typeof obj.key === 'string') {
          out.push({ key: obj.key, val: typeof obj.val === 'string' ? obj.val : '' });
        }
      }
    }
    return out;
  }
  if (value && typeof value === 'object') {
    const out: Array<{ key: string; val: string }> = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string') out.push({ key: k, val: v });
    }
    return out;
  }
  return [];
}

function parseBodyForUi(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
}

// ─── Providers ────────────────────────────────────────────────────────

export interface ProviderAdminRow {
  id: number;
  type: string;
  name: string;
  baseUrl: string | null;
  homepage: string | null;
  hasApiKey: boolean;
  apiKeyMask: string | null;
  modelCount: number;
  updatedAt: string;
}

interface ProviderRawRow {
  id: number;
  type: string;
  name: string;
  base_url: string | null;
  homepage: string | null;
  has_api_key: boolean;
  api_key_mask: string | null;
  model_count: number;
  updated_at: string | Date;
}

export async function loadProvidersAdmin(): Promise<ProviderAdminRow[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT
      p.id,
      p.type::text AS type,
      p.name,
      p.base_url,
      p.homepage,
      (p.api_key_enc IS NOT NULL) AS has_api_key,
      -- 旧实现从密文尾部取 3 字节;虽然 AES-GCM 每次写入随机化,但仍是把
      -- 密文片段送到客户端,无意义且会随 schema 变化解读不同。直接固定掩码。
      CASE WHEN p.api_key_enc IS NOT NULL THEN '••••••••' ELSE NULL END AS api_key_mask,
      COALESCE(m.cnt, 0)::int AS model_count,
      p.updated_at
    FROM providers p
    LEFT JOIN (
      SELECT provider_id, COUNT(*)::int AS cnt FROM models GROUP BY provider_id
    ) m ON m.provider_id = p.id
    ORDER BY p.id
  `)) as unknown as ProviderRawRow[];
  return rows.map((r) => ({
    id: Number(r.id),
    type: r.type,
    name: r.name,
    baseUrl: r.base_url,
    homepage: r.homepage,
    hasApiKey: Boolean(r.has_api_key),
    apiKeyMask: r.api_key_mask,
    modelCount: Number(r.model_count),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

// ─── Models ───────────────────────────────────────────────────────────

export interface ModelAdminRow {
  id: number;
  providerId: number;
  providerName: string;
  providerType: string;
  name: string;
  capabilities: string[];
  usedInConfigs: number;
}

interface ModelRawRow {
  id: number;
  provider_id: number;
  provider_name: string;
  provider_type: string;
  name: string;
  capabilities: string[] | null;
  used_in_configs: number;
}

export async function loadModelsAdmin(): Promise<ModelAdminRow[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT
      m.id,
      m.provider_id,
      p.name AS provider_name,
      p.type::text AS provider_type,
      m.model_name AS name,
      m.capability AS capabilities,
      COALESCE(c.cnt, 0)::int AS used_in_configs
    FROM models m
    JOIN providers p ON p.id = m.provider_id
    LEFT JOIN (
      SELECT model_id, COUNT(*)::int AS cnt FROM check_configs GROUP BY model_id
    ) c ON c.model_id = m.id
    ORDER BY p.id, m.model_name
  `)) as unknown as ModelRawRow[];
  return rows.map((r) => ({
    id: Number(r.id),
    providerId: Number(r.provider_id),
    providerName: r.provider_name,
    providerType: r.provider_type,
    name: r.name,
    capabilities: r.capabilities ?? [],
    usedInConfigs: Number(r.used_in_configs),
  }));
}

// ─── Groups ───────────────────────────────────────────────────────────

export interface GroupAdminRow {
  id: number;
  slug: string;
  displayName: string;
  description: string | null;
  sortOrder: number;
  componentCount: number;
}

interface GroupRawRow {
  id: number;
  slug: string;
  display_name: string;
  description: string | null;
  sort_order: number;
  component_count: number;
}

export async function loadGroupsAdmin(): Promise<GroupAdminRow[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT
      g.id,
      g.slug,
      g.display_name,
      g.description,
      g.sort_order,
      COALESCE(c.cnt, 0)::int AS component_count
    FROM groups g
    LEFT JOIN (
      SELECT group_id, COUNT(*)::int AS cnt FROM check_configs WHERE group_id IS NOT NULL GROUP BY group_id
    ) c ON c.group_id = g.id
    ORDER BY g.sort_order, g.id
  `)) as unknown as GroupRawRow[];
  return rows.map((r) => ({
    id: Number(r.id),
    slug: r.slug,
    displayName: r.display_name,
    description: r.description,
    sortOrder: Number(r.sort_order),
    componentCount: Number(r.component_count),
  }));
}

// ─── Configs (probe components) ───────────────────────────────────────

export interface ConfigAdminRow {
  id: number;
  groupId: number | null;
  groupSlug: string | null;
  groupDisplayName: string | null;
  modelId: number;
  modelName: string;
  providerType: string;
  providerBaseUrl: string | null;
  providerHasApiKey: boolean;
  displayName: string;
  endpoint: string | null;
  endpointPath: string | null;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers: Array<{ key: string; val: string }>;
  requestBody: string | null;
  enabled: boolean;
  isMaintenance: boolean;
  pollIntervalSeconds: number;
  timeoutMs: number;
  sortOrder: number;
  hasOwnApiKey: boolean;
  latestStatus: 'ok' | 'degraded' | 'down' | 'timeout' | null;
  latestLatencyMs: number | null;
  /** 30 段：近 30 天每日可用率（0-100），最旧的在前。 */
  uptime30dDaily: number[];
  /** 30 天总可用率（0-100）。 */
  uptime30dAvg: number | null;
}

interface ConfigRawRow {
  id: number;
  group_id: number | null;
  group_slug: string | null;
  group_display_name: string | null;
  model_id: number;
  model_name: string;
  provider_type: string;
  provider_base_url: string | null;
  provider_has_api_key: boolean;
  display_name: string;
  endpoint: string | null;
  endpoint_path: string | null;
  method: string;
  headers: unknown;
  request_body: unknown;
  enabled: boolean;
  is_maintenance: boolean;
  poll_interval_seconds: number;
  timeout_ms: number;
  sort_order: number;
  has_own_api_key: boolean;
  latest_status: string | null;
  latest_latency_ms: number | null;
  uptime_30d_avg: number | null;
  uptime_30d_daily: number[] | null;
}

export async function loadConfigsAdmin(): Promise<ConfigAdminRow[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (config_id)
        config_id, status::text AS status, latency_ms
      FROM check_results
      WHERE checked_at >= NOW() - INTERVAL '24 hours'
      ORDER BY config_id, checked_at DESC
    ),
    cal AS (
      SELECT
        c.id AS config_id,
        d::date AS day
      FROM check_configs c
      CROSS JOIN generate_series(
        date_trunc('day', NOW() AT TIME ZONE 'UTC') - INTERVAL '29 days',
        date_trunc('day', NOW() AT TIME ZONE 'UTC'),
        INTERVAL '1 day'
      ) AS d
    ),
    days AS (
      SELECT
        config_id,
        date_trunc('day', bucket_at AT TIME ZONE 'UTC')::date AS day,
        SUM(total)::int AS total,
        SUM(ok_count + degraded_count)::int AS up
      FROM check_results_5min
      WHERE bucket_at >= NOW() - INTERVAL '30 days'
      GROUP BY config_id, day
    ),
    uptime AS (
      SELECT
        cal.config_id,
        CASE WHEN SUM(COALESCE(d.total, 0)) > 0
          THEN ROUND(100.0 * SUM(COALESCE(d.up, 0)) / SUM(COALESCE(d.total, 0)), 2)
          ELSE NULL END AS avg_pct,
        array_agg(
          CASE WHEN d.total IS NULL OR d.total = 0 THEN 100.0
            ELSE ROUND(100.0 * d.up / d.total, 1) END
          ORDER BY cal.day
        ) AS daily
      FROM cal
      LEFT JOIN days d ON d.config_id = cal.config_id AND d.day = cal.day
      GROUP BY cal.config_id
    )
    SELECT
      c.id, c.group_id, c.model_id, c.display_name, c.endpoint, c.endpoint_path,
      c.method, c.headers, c.request_body, c.enabled, c.is_maintenance,
      c.poll_interval_seconds, c.timeout_ms, c.sort_order,
      (c.api_key_enc IS NOT NULL) AS has_own_api_key,
      g.slug AS group_slug, g.display_name AS group_display_name,
      m.model_name, p.type::text AS provider_type, p.base_url AS provider_base_url,
      (p.api_key_enc IS NOT NULL) AS provider_has_api_key,
      l.status AS latest_status, l.latency_ms AS latest_latency_ms,
      u.avg_pct AS uptime_30d_avg,
      u.daily AS uptime_30d_daily
    FROM check_configs c
    JOIN models m ON m.id = c.model_id
    JOIN providers p ON p.id = m.provider_id
    LEFT JOIN groups g ON g.id = c.group_id
    LEFT JOIN latest l ON l.config_id = c.id
    LEFT JOIN uptime u ON u.config_id = c.id
    ORDER BY c.sort_order, c.id
  `)) as unknown as ConfigRawRow[];

  return rows.map((r) => ({
    id: Number(r.id),
    groupId: r.group_id != null ? Number(r.group_id) : null,
    groupSlug: r.group_slug,
    groupDisplayName: r.group_display_name,
    modelId: Number(r.model_id),
    modelName: r.model_name,
    providerType: r.provider_type,
    providerBaseUrl: r.provider_base_url,
    providerHasApiKey: Boolean(r.provider_has_api_key),
    displayName: r.display_name,
    endpoint: r.endpoint,
    endpointPath: r.endpoint_path,
    method: (typeof r.method === 'string' && /^(GET|POST|PUT|PATCH|DELETE|HEAD)$/.test(r.method)
      ? r.method
      : 'POST') as ConfigAdminRow['method'],
    headers: parseHeaderPairsForUi(r.headers),
    requestBody: parseBodyForUi(r.request_body),
    enabled: Boolean(r.enabled),
    isMaintenance: Boolean(r.is_maintenance),
    pollIntervalSeconds: Number(r.poll_interval_seconds),
    timeoutMs: Number(r.timeout_ms),
    sortOrder: Number(r.sort_order),
    hasOwnApiKey: Boolean(r.has_own_api_key),
    latestStatus: (r.latest_status as ConfigAdminRow['latestStatus']) ?? null,
    latestLatencyMs: r.latest_latency_ms != null ? Number(r.latest_latency_ms) : null,
    uptime30dAvg: r.uptime_30d_avg != null ? Number(r.uptime_30d_avg) : null,
    uptime30dDaily: (r.uptime_30d_daily ?? []).map((v) => Number(v)),
  }));
}

// ─── Subscriptions / Webhook KPIs ─────────────────────────────────────

export interface SubscriptionAdminRow {
  id: number;
  label: string | null;
  target: string;
  /** 仅末 4 位掩码;明文 secret 永不出现在客户端 prop 中。 */
  secretMask: string | null;
  hasSecret: boolean;
  channel: string;
  createdAt: string;
  eventCount: number;
  status: 'active' | 'failing' | 'unverified';
}

interface SubscriptionRawRow {
  id: number;
  label: string | null;
  target: string;
  secret: string | null;
  channel: string;
  created_at: string | Date;
  verified: boolean;
  event_count: number;
  recent_failures: number;
  recent_total: number;
}

function tailMask(secret: string | null): string | null {
  if (!secret) return null;
  if (secret.length <= 4) return '••••';
  return `••••${secret.slice(-4)}`;
}

export async function loadSubscriptionsAdmin(): Promise<SubscriptionAdminRow[]> {
  const db = getDb();
  // secret 仅用于服务端派生掩码,不进入返回结构。
  const rows = (await db.execute(sql`
    SELECT
      s.id, s.label, s.target, s.secret, s.channel::text AS channel,
      s.created_at, s.verified,
      COALESCE(ec.cnt, 0)::int AS event_count,
      COALESCE(d.fails, 0)::int AS recent_failures,
      COALESCE(d.total, 0)::int AS recent_total
    FROM subscriptions s
    LEFT JOIN (
      SELECT subscription_id, COUNT(*)::int AS cnt
      FROM subscription_components GROUP BY subscription_id
    ) ec ON ec.subscription_id = s.id
    LEFT JOIN (
      SELECT subscription_id,
             SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS fails,
             COUNT(*)::int AS total
      FROM webhook_deliveries
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY subscription_id
    ) d ON d.subscription_id = s.id
    ORDER BY s.id
  `)) as unknown as SubscriptionRawRow[];

  return rows.map((r) => {
    let status: SubscriptionAdminRow['status'] = 'active';
    if (!r.verified) status = 'unverified';
    else if (Number(r.recent_total) > 0 && Number(r.recent_failures) / Number(r.recent_total) > 0.5)
      status = 'failing';
    return {
      id: Number(r.id),
      label: r.label,
      target: r.target,
      secretMask: tailMask(r.secret),
      hasSecret: Boolean(r.secret),
      channel: r.channel,
      createdAt: new Date(r.created_at).toISOString(),
      eventCount: Number(r.event_count),
      status,
    };
  });
}

export interface WebhookKpis {
  total: number;
  failing: number;
  deliveriesLast24h: number;
  failRate: number;
}

export async function loadWebhookKpis(): Promise<WebhookKpis> {
  const db = getDb();
  const rows = (await db.execute(sql`
    WITH d AS (
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS fails
      FROM webhook_deliveries
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    ),
    f AS (
      SELECT COUNT(*)::int AS cnt
      FROM (
        SELECT d.subscription_id
        FROM webhook_deliveries d
        JOIN subscriptions s ON s.id = d.subscription_id AND s.channel = 'webhook'
        WHERE d.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY d.subscription_id
        HAVING SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END)::float / COUNT(*) > 0.5
      ) x
    ),
    s AS (
      SELECT COUNT(*)::int AS cnt FROM subscriptions WHERE channel = 'webhook'
    )
    SELECT s.cnt AS total, f.cnt AS failing, d.total AS deliveries_24h, d.fails AS fails_24h FROM s, f, d
  `)) as unknown as Array<{
    total: number;
    failing: number;
    deliveries_24h: number;
    fails_24h: number;
  }>;
  const r = rows[0] ?? { total: 0, failing: 0, deliveries_24h: 0, fails_24h: 0 };
  const deliveriesLast24h = Number(r.deliveries_24h);
  const fails24h = Number(r.fails_24h);
  return {
    total: Number(r.total),
    failing: Number(r.failing),
    deliveriesLast24h,
    failRate: deliveriesLast24h > 0 ? fails24h / deliveriesLast24h : 0,
  };
}

export interface DeliveryAdminRow {
  id: number;
  subscriptionId: number;
  subscriptionLabel: string | null;
  eventType: string;
  httpStatus: number | null;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  durationMs: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

interface DeliveryRawRow {
  id: number;
  subscription_id: number;
  subscription_label: string | null;
  event_type: string;
  http_status: number | null;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  duration_ms: number | null;
  last_error: string | null;
  delivered_at: string | Date | null;
  created_at: string | Date;
}

export async function loadRecentDeliveries(limit = 20): Promise<DeliveryAdminRow[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT
      d.id, d.subscription_id, s.label AS subscription_label,
      d.event_type, d.http_status, d.status::text AS status,
      d.attempts, d.duration_ms, d.last_error, d.delivered_at, d.created_at
    FROM webhook_deliveries d
    LEFT JOIN subscriptions s ON s.id = d.subscription_id
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `)) as unknown as DeliveryRawRow[];
  return rows.map((r) => ({
    id: Number(r.id),
    subscriptionId: Number(r.subscription_id),
    subscriptionLabel: r.subscription_label,
    eventType: r.event_type,
    httpStatus: r.http_status != null ? Number(r.http_status) : null,
    status: r.status,
    attempts: Number(r.attempts),
    durationMs: r.duration_ms != null ? Number(r.duration_ms) : null,
    lastError: r.last_error,
    deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

// ─── Mirrors (admin) ──────────────────────────────────────────────────

export interface MirrorAdminRow {
  id: number;
  name: string;
  statusUrl: string;
  homepage: string | null;
  providerId: number | null;
  providerType: string | null;
  feedKind: 'statuspage_v2' | 'rss' | 'atom';
  feedUrl: string | null;
  syncIntervalSeconds: number;
  enabled: boolean;
  sortOrder: number;
  latestStatus: string | null;
  latestDescription: string | null;
  latestFetchedAt: string | null;
  snapshotsLast24h: number;
  snapshotsTotal: number;
  /** 24 段近 24 小时每小时**最近一条**快照的状态。无数据为 null。 */
  hourly24: Array<OfficialOverallStatus | null>;
  /** 该 mirror 上游当前未解决的事件数。 */
  upstreamActiveCount: number;
}

/**
 * 归一化 array_agg 出的小时状态数组。
 * drizzle/postgres.js 在 `db.execute` 里把 text[] 的 SQL NULL 元素当成字符串
 * "NULL" 透传（而非 JS null），直接渲染会出现 "undefined" 的状态条 tooltip。
 * 这里统一把 "NULL"、JS null、以及任何非法状态值都收敛为 JS null。
 */
function normalizeHourly(
  arr: Array<string | null> | null | undefined,
): Array<OfficialOverallStatus | null> {
  if (!arr) return [];
  return arr.map((s) =>
    s != null && s !== 'NULL' && s in OFFICIAL_STATUS_LABEL ? (s as OfficialOverallStatus) : null,
  );
}

interface MirrorRawRow {
  id: number;
  name: string;
  status_url: string;
  homepage: string | null;
  provider_id: number | null;
  provider_type: string | null;
  feed_kind: string;
  feed_url: string | null;
  sync_interval_seconds: number;
  enabled: boolean;
  sort_order: number;
  latest_status: string | null;
  latest_description: string | null;
  latest_fetched_at: string | Date | null;
  snapshots_24h: number;
  snapshots_total: number;
  hourly24: Array<string | null>;
  upstream_active: number;
}

export async function loadMirrorsAdmin(): Promise<MirrorAdminRow[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (mirror_id)
        mirror_id, overall_status, description, fetched_at
      FROM official_status_snapshots
      ORDER BY mirror_id, fetched_at DESC
    ),
    counts24 AS (
      SELECT mirror_id, COUNT(*)::int AS n
      FROM official_status_snapshots
      WHERE fetched_at >= NOW() - INTERVAL '24 hours'
      GROUP BY mirror_id
    ),
    counts_total AS (
      SELECT mirror_id, COUNT(*)::int AS n
      FROM official_status_snapshots
      GROUP BY mirror_id
    ),
    hours AS (
      SELECT
        m.id AS mirror_id,
        gs.h AS hour_idx,
        (
          SELECT overall_status
          FROM official_status_snapshots s
          WHERE s.mirror_id = m.id
            AND s.fetched_at >= NOW() - ((24 - gs.h) || ' hours')::interval
            AND s.fetched_at <  NOW() - ((23 - gs.h) || ' hours')::interval
          ORDER BY s.fetched_at DESC
          LIMIT 1
        ) AS status
      FROM official_status_mirrors m
      CROSS JOIN generate_series(0, 23) AS gs(h)
    ),
    hourly AS (
      SELECT mirror_id, array_agg(status ORDER BY hour_idx) AS hourly24
      FROM hours
      GROUP BY mirror_id
    )
    SELECT
      m.id, m.name, m.status_url, m.homepage, m.provider_id,
      p.type::text AS provider_type,
      m.feed_kind, m.feed_url,
      m.sync_interval_seconds, m.enabled, m.sort_order,
      l.overall_status AS latest_status,
      l.description AS latest_description,
      l.fetched_at AS latest_fetched_at,
      COALESCE(c24.n, 0)::int AS snapshots_24h,
      COALESCE(ct.n, 0)::int AS snapshots_total,
      COALESCE(h.hourly24, ARRAY[]::text[]) AS hourly24,
      COALESCE(ua.n, 0)::int AS upstream_active
    FROM official_status_mirrors m
    LEFT JOIN providers p ON p.id = m.provider_id
    LEFT JOIN latest l ON l.mirror_id = m.id
    LEFT JOIN counts24 c24 ON c24.mirror_id = m.id
    LEFT JOIN counts_total ct ON ct.mirror_id = m.id
    LEFT JOIN hourly h ON h.mirror_id = m.id
    LEFT JOIN (
      SELECT mirror_id, COUNT(*)::int AS n
      FROM official_upstream_incidents
      WHERE resolved_at IS NULL
      GROUP BY mirror_id
    ) ua ON ua.mirror_id = m.id
    ORDER BY m.sort_order, m.id
  `)) as unknown as MirrorRawRow[];
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    statusUrl: r.status_url,
    homepage: r.homepage,
    providerId: r.provider_id != null ? Number(r.provider_id) : null,
    providerType: r.provider_type,
    feedKind: (['statuspage_v2', 'rss', 'atom'].includes(r.feed_kind)
      ? r.feed_kind
      : 'statuspage_v2') as MirrorAdminRow['feedKind'],
    feedUrl: r.feed_url,
    syncIntervalSeconds: Number(r.sync_interval_seconds),
    enabled: Boolean(r.enabled),
    sortOrder: Number(r.sort_order),
    latestStatus: r.latest_status,
    latestDescription: r.latest_description,
    latestFetchedAt: r.latest_fetched_at ? new Date(r.latest_fetched_at).toISOString() : null,
    snapshotsLast24h: Number(r.snapshots_24h),
    snapshotsTotal: Number(r.snapshots_total),
    hourly24: normalizeHourly(r.hourly24),
    upstreamActiveCount: Number(r.upstream_active),
  }));
}

// ─── Upstream incidents (admin + public) ─────────────────────────────

export interface UpstreamIncidentRow {
  id: number;
  mirrorId: number;
  mirrorName: string;
  providerType: string | null;
  upstreamId: string;
  kind: 'incident' | 'maintenance';
  title: string;
  status: string | null;
  impact: string | null;
  url: string | null;
  startedAt: string | null;
  resolvedAt: string | null;
  lastUpdateBody: string | null;
  lastUpdateAt: string | null;
}

interface UpstreamRawRow {
  id: number;
  mirror_id: number;
  mirror_name: string;
  provider_type: string | null;
  upstream_id: string;
  kind: string;
  title: string;
  status: string | null;
  impact: string | null;
  url: string | null;
  started_at: string | Date | null;
  resolved_at: string | Date | null;
  last_update_body: string | null;
  last_update_at: string | Date | null;
}

/** Active (unresolved) upstream events across all enabled mirrors. */
export async function loadActiveUpstreamIncidents(): Promise<UpstreamIncidentRow[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT
      ui.id, ui.mirror_id, m.name AS mirror_name, p.type::text AS provider_type,
      ui.upstream_id, ui.kind, ui.title, ui.status, ui.impact, ui.url,
      ui.started_at, ui.resolved_at, ui.last_update_body, ui.last_update_at
    FROM official_upstream_incidents ui
    JOIN official_status_mirrors m ON m.id = ui.mirror_id
    LEFT JOIN providers p ON p.id = m.provider_id
    WHERE m.enabled = true AND ui.resolved_at IS NULL
    ORDER BY ui.started_at DESC NULLS LAST, ui.id DESC
  `)) as unknown as UpstreamRawRow[];
  return rows.map(mapUpstreamRow);
}

function mapUpstreamRow(r: UpstreamRawRow): UpstreamIncidentRow {
  return {
    id: Number(r.id),
    mirrorId: Number(r.mirror_id),
    mirrorName: r.mirror_name,
    providerType: r.provider_type,
    upstreamId: r.upstream_id,
    kind: r.kind === 'maintenance' ? 'maintenance' : 'incident',
    title: r.title,
    status: r.status,
    impact: r.impact,
    url: r.url,
    startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
    resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
    lastUpdateBody: r.last_update_body,
    lastUpdateAt: r.last_update_at ? new Date(r.last_update_at).toISOString() : null,
  };
}
