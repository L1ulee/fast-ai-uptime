import {
  bigserial,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

// ─── Enums ──────────────────────────────────────────────────────────

export const providerTypeEnum = pgEnum('provider_type', [
  'openai',
  'anthropic',
  'gemini',
  'custom',
]);

export const checkStatusEnum = pgEnum('check_status', ['ok', 'degraded', 'down', 'timeout']);

export const errorKindEnum = pgEnum('error_kind', [
  'auth',
  'rate_limit',
  'server_error',
  'network',
  'timeout',
  'invalid_response',
]);

export const incidentStatusEnum = pgEnum('incident_status', [
  'investigating',
  'identified',
  'monitoring',
  'resolved',
]);

export const incidentImpactEnum = pgEnum('incident_impact', ['none', 'minor', 'major', 'critical']);

/** 事件来源：manual = 管理员手动录入；auto = 探测扫描器联动自动创建。 */
export const incidentSourceEnum = pgEnum('incident_source', ['manual', 'auto']);

export const maintenanceStatusEnum = pgEnum('maintenance_status', [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
]);

export const announcementLevelEnum = pgEnum('announcement_level', ['info', 'warning', 'error']);

export const subscriptionChannelEnum = pgEnum('subscription_channel', [
  'email',
  'webhook',
  'slack',
  'discord',
]);

// ─── Providers / Models / Groups ────────────────────────────────────

export const providers = pgTable(
  'providers',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    type: providerTypeEnum().notNull(),
    name: text().notNull(),
    homepage: text(),
    /** Provider 共享 base URL，例：https://api.openai.com/v1。
     *  组件可仅指定 endpointPath（/chat/completions）即可拼接出完整 URL。 */
    baseUrl: text(),
    /** Provider 共享 API Key（AES-256-GCM 加密）；组件无单独 key 时使用。 */
    apiKeyEnc: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.type, t.name)],
);

export const models = pgTable(
  'models',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    providerId: bigint({ mode: 'number' })
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    modelName: text().notNull(),
    capability: text().array(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.providerId, t.modelName)],
);

export const groups = pgTable('groups', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  slug: text().notNull().unique(),
  displayName: text().notNull(),
  description: text(),
  homepage: text(),
  sortOrder: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// ─── Check Configs / Results ────────────────────────────────────────

export const checkConfigs = pgTable(
  'check_configs',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    groupId: bigint({ mode: 'number' }).references(() => groups.id, {
      onDelete: 'set null',
    }),
    modelId: bigint({ mode: 'number' })
      .notNull()
      .references(() => models.id, { onDelete: 'cascade' }),
    displayName: text().notNull(),
    /** 完整 endpoint URL（覆盖优先）。可空：留空时由 provider.baseUrl + endpointPath 拼接。 */
    endpoint: text(),
    /** 相对路径（推荐写法），与 provider.baseUrl 拼接得到完整 URL。 */
    endpointPath: text(),
    /** HTTP 请求方法（GET/POST/PUT/PATCH/DELETE/HEAD）。 */
    method: text().notNull().default('POST'),
    /** 组件级 API Key 覆盖；为空时使用 provider.apiKeyEnc。 */
    apiKeyEnc: text(),
    /** 自定义请求体（JSON 或字符串）；支持 {{API_KEY}} {{model}} {{timestamp}} 模板。 */
    requestBody: jsonb(),
    /** 自定义请求头数组：[{key, val}]，val 支持 {{API_KEY}} 模板。 */
    headers: jsonb(),
    enabled: boolean().notNull().default(true),
    isMaintenance: boolean().notNull().default(false),
    pollIntervalSeconds: integer().notNull().default(60),
    timeoutMs: integer().notNull().default(30000),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_check_configs_group').on(t.groupId),
    index('idx_check_configs_enabled').on(t.enabled, t.isMaintenance),
  ],
);

export const checkResults = pgTable(
  'check_results',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    configId: bigint({ mode: 'number' })
      .notNull()
      .references(() => checkConfigs.id, { onDelete: 'cascade' }),
    status: checkStatusEnum().notNull(),
    latencyMs: integer(),
    pingMs: integer(),
    httpStatus: integer(),
    errorKind: errorKindEnum(),
    errorMessage: text(),
    region: text().notNull().default('default'),
    checkedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    index('idx_check_results_config_time').on(t.configId, t.checkedAt.desc()),
    index('idx_check_results_checked_at').on(t.checkedAt),
  ],
);

export const checkResults5min = pgTable(
  'check_results_5min',
  {
    configId: bigint({ mode: 'number' })
      .notNull()
      .references(() => checkConfigs.id, { onDelete: 'cascade' }),
    bucketAt: timestamp({ withTimezone: true }).notNull(),
    total: integer().notNull().default(0),
    okCount: integer().notNull().default(0),
    degradedCount: integer().notNull().default(0),
    downCount: integer().notNull().default(0),
    p50Ms: integer(),
    p95Ms: integer(),
    p99Ms: integer(),
  },
  (t) => [
    primaryKey({ columns: [t.configId, t.bucketAt] }),
    index('idx_check_results_5min_bucket').on(t.bucketAt),
  ],
);

// ─── Incidents ──────────────────────────────────────────────────────

export const incidents = pgTable(
  'incidents',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    title: text().notNull(),
    status: incidentStatusEnum().notNull().default('investigating'),
    impact: incidentImpactEnum().notNull().default('minor'),
    isPublic: boolean().notNull().default(true),
    /** 事件来源；auto 行由 incident-scanner 联动探测组件创建。 */
    source: incidentSourceEnum().notNull().default('manual'),
    /** 自动事件追踪的探测组件；扫描器据此查"该组件已存在的未关闭自动事件"。 */
    autoConfigId: bigint({ mode: 'number' }).references(() => checkConfigs.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_incidents_status').on(t.status),
    index('idx_incidents_started').on(t.startedAt),
    index('idx_incidents_auto_config').on(t.autoConfigId),
  ],
);

export const incidentUpdates = pgTable(
  'incident_updates',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    incidentId: bigint({ mode: 'number' })
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    status: incidentStatusEnum().notNull(),
    /** 该条更新发布时的影响等级快照。 */
    impact: incidentImpactEnum().notNull().default('minor'),
    bodyMd: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_incident_updates_incident').on(t.incidentId, t.createdAt)],
);

export const incidentComponents = pgTable(
  'incident_components',
  {
    incidentId: bigint({ mode: 'number' })
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    configId: bigint({ mode: 'number' })
      .notNull()
      .references(() => checkConfigs.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.incidentId, t.configId] })],
);

/** 每条更新发布时的受影响组件快照（与 incident_components 解耦，保留历史）。 */
export const incidentUpdateComponents = pgTable(
  'incident_update_components',
  {
    updateId: bigint({ mode: 'number' })
      .notNull()
      .references(() => incidentUpdates.id, { onDelete: 'cascade' }),
    configId: bigint({ mode: 'number' })
      .notNull()
      .references(() => checkConfigs.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.updateId, t.configId] })],
);

// ─── Maintenances ───────────────────────────────────────────────────

export const maintenances = pgTable(
  'maintenances',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    title: text().notNull(),
    bodyMd: text(),
    scheduledStart: timestamp({ withTimezone: true }).notNull(),
    scheduledEnd: timestamp({ withTimezone: true }).notNull(),
    status: maintenanceStatusEnum().notNull().default('scheduled'),
    notifyLeadMinutes: integer().notNull().default(60),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_maintenances_status').on(t.status),
    index('idx_maintenances_window').on(t.scheduledStart, t.scheduledEnd),
  ],
);

export const maintenanceComponents = pgTable(
  'maintenance_components',
  {
    maintenanceId: bigint({ mode: 'number' })
      .notNull()
      .references(() => maintenances.id, { onDelete: 'cascade' }),
    configId: bigint({ mode: 'number' })
      .notNull()
      .references(() => checkConfigs.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.maintenanceId, t.configId] })],
);

// ─── Announcements ──────────────────────────────────────────────────

export const announcements = pgTable(
  'announcements',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    bodyMd: text().notNull(),
    level: announcementLevelEnum().notNull().default('info'),
    startsAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp({ withTimezone: true }),
    enabled: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_announcements_active').on(t.enabled, t.startsAt, t.endsAt)],
);

// ─── Official Status Mirror ─────────────────────────────────────────
// 官方状态镜像独立于 providers：可以为任意 statuspage.io 兼容地址
// 创建一个独立的镜像，并按 syncIntervalSeconds 周期拉取。

export const officialStatusMirrors = pgTable(
  'official_status_mirrors',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    name: text().notNull(),
    statusUrl: text().notNull(),
    homepage: text(),
    /** 可选关联 Provider（用于 UI 显示 ProviderMark 与归属）。 */
    providerId: bigint({ mode: 'number' }).references(() => providers.id, {
      onDelete: 'set null',
    }),
    /** 数据源种类：statuspage_v2 / rss / atom。 */
    feedKind: text().notNull().default('statuspage_v2'),
    /** 可选独立 feed URL（统一规则：未填时复用 statusUrl）。 */
    feedUrl: text(),
    syncIntervalSeconds: integer().notNull().default(300),
    enabled: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.statusUrl)],
);

export const officialUpstreamIncidents = pgTable(
  'official_upstream_incidents',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    mirrorId: bigint({ mode: 'number' })
      .notNull()
      .references(() => officialStatusMirrors.id, { onDelete: 'cascade' }),
    /** 来源稳定 id（如 statuspage incident id 或 RSS guid）。 */
    upstreamId: text().notNull(),
    /** 'incident' | 'maintenance' */
    kind: text().notNull().default('incident'),
    title: text().notNull(),
    /** statuspage 状态机或 RSS 解析出的状态（resolved/investigating/...）。 */
    status: text(),
    /** statuspage impact（none/minor/major/critical/maintenance）。 */
    impact: text(),
    /** 跳转链接。 */
    url: text(),
    startedAt: timestamp({ withTimezone: true }),
    resolvedAt: timestamp({ withTimezone: true }),
    lastUpdateBody: text(),
    lastUpdateAt: timestamp({ withTimezone: true }),
    raw: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('official_upstream_incidents_mirror_id_upstream_id_unique').on(t.mirrorId, t.upstreamId),
    index('idx_upstream_incidents_mirror').on(t.mirrorId, t.startedAt.desc()),
  ],
);

export const officialStatusSnapshots = pgTable(
  'official_status_snapshots',
  {
    mirrorId: bigint({ mode: 'number' })
      .notNull()
      .references(() => officialStatusMirrors.id, { onDelete: 'cascade' }),
    fetchedAt: timestamp({ withTimezone: true }).notNull(),
    overallStatus: text(),
    /** Statuspage.io status.description, e.g. "All Systems Operational"。 */
    description: text(),
    rawPayload: jsonb(),
  },
  (t) => [primaryKey({ columns: [t.mirrorId, t.fetchedAt] })],
);

// ─── Subscriptions ──────────────────────────────────────────────────

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    channel: subscriptionChannelEnum().notNull(),
    target: text().notNull(),
    label: text(),
    secret: text(),
    verified: boolean().notNull().default(false),
    unsubToken: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_subscriptions_channel_target').on(t.channel, t.target)],
);

export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', [
  'pending',
  'delivered',
  'failed',
]);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    subscriptionId: bigint({ mode: 'number' })
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    eventType: text().notNull(),
    payload: jsonb().notNull(),
    status: webhookDeliveryStatusEnum().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    /** HTTP 状态码（0 表示超时/网络错误）。 */
    httpStatus: integer(),
    /** 最近一次投递耗时（毫秒）。 */
    durationMs: integer(),
    lastError: text(),
    nextRetryAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_webhook_deliveries_due').on(t.status, t.nextRetryAt),
    index('idx_webhook_deliveries_sub').on(t.subscriptionId, t.createdAt),
  ],
);

export const subscriptionComponents = pgTable(
  'subscription_components',
  {
    subscriptionId: bigint({ mode: 'number' })
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    configId: bigint({ mode: 'number' })
      .notNull()
      .references(() => checkConfigs.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.subscriptionId, t.configId] })],
);

// ─── Probe leases (multi-node leader election) ─────────────────────

export const probeLeases = pgTable('probe_leases', {
  leaseKey: text().primaryKey(),
  nodeId: text().notNull(),
  acquiredAt: timestamp({ withTimezone: true }).notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

// ─── Audit logs ─────────────────────────────────────────────────────

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    actor: text().notNull().default('admin'),
    action: text().notNull(),
    target: text(),
    payload: jsonb(),
    ip: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_audit_logs_created').on(t.createdAt)],
);

// ─── Inferred types ─────────────────────────────────────────────────

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;

export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;

export type CheckConfig = typeof checkConfigs.$inferSelect;
export type NewCheckConfig = typeof checkConfigs.$inferInsert;

export type CheckResult = typeof checkResults.$inferSelect;
export type NewCheckResult = typeof checkResults.$inferInsert;

export type Incident = typeof incidents.$inferSelect;
export type NewIncident = typeof incidents.$inferInsert;

export type IncidentUpdate = typeof incidentUpdates.$inferSelect;
export type NewIncidentUpdate = typeof incidentUpdates.$inferInsert;

export type IncidentUpdateComponent = typeof incidentUpdateComponents.$inferSelect;
export type NewIncidentUpdateComponent = typeof incidentUpdateComponents.$inferInsert;

export type Maintenance = typeof maintenances.$inferSelect;
export type NewMaintenance = typeof maintenances.$inferInsert;

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;

export type ProbeLease = typeof probeLeases.$inferSelect;
export type NewProbeLease = typeof probeLeases.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type OfficialStatusMirror = typeof officialStatusMirrors.$inferSelect;
export type NewOfficialStatusMirror = typeof officialStatusMirrors.$inferInsert;

export type OfficialUpstreamIncident = typeof officialUpstreamIncidents.$inferSelect;
export type NewOfficialUpstreamIncident = typeof officialUpstreamIncidents.$inferInsert;

// ─── System Logs ────────────────────────────────────────────────────
// 统一日志流，支撑 /admin/logs。`source` 区分来源：
//   audit   — 管理操作（也由 audit_logs 表写入，logs 页面会 union）
//   probe   — 探测结果（probe runner）
//   webhook — Webhook 投递
//   system  — 定时任务、TLS、限流等系统事件

export const logLevelEnum = pgEnum('log_level', ['debug', 'info', 'warn', 'error']);

export const logSourceEnum = pgEnum('log_source', ['audit', 'probe', 'webhook', 'system']);

export const logs = pgTable(
  'logs',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    level: logLevelEnum().notNull().default('info'),
    source: logSourceEnum().notNull().default('system'),
    actor: text().notNull().default('system'),
    action: text().notNull(),
    target: text(),
    message: text().notNull().default(''),
    meta: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_logs_created').on(t.createdAt.desc()),
    index('idx_logs_level').on(t.level),
    index('idx_logs_source').on(t.source),
  ],
);

// ─── App Settings ───────────────────────────────────────────────────
// 键值存储，支撑 /admin/settings。每个 section 一行（site/branding/...）。

export const appSettings = pgTable('app_settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type LogEntry = typeof logs.$inferSelect;
export type NewLogEntry = typeof logs.$inferInsert;

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
