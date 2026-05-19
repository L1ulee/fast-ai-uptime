import { sql } from 'drizzle-orm';
import {
  AlertTriangle,
  Boxes,
  LayoutDashboard,
  Megaphone,
  Plus,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { getDb } from '@fau/db';
import { RefreshButton } from '@/components/admin/refresh-button';
import { type LogLevel, type LogSource, loadUnifiedLogs } from '@/lib/admin/logs-feed';

export const dynamic = 'force-dynamic';

interface DashboardData {
  counts: {
    providers: number;
    providerNames: string[];
    models: number;
    configsTotal: number;
    configsEnabled: number;
    inMaintConfigs: number;
    activeIncidents: number;
    upcomingMaintenances: number;
    announcements: number;
  };
  uptime30d: {
    pct: number; // 0–100
    delta: number; // pct points
  };
  recentChecks: Array<{
    id: number;
    name: string;
    status: string;
    latencyMs: number | null;
    checkedAt: string;
  }>;
  activeIncidents: Array<{
    id: number;
    title: string;
    status: string;
    startedAt: string;
    affected: string[];
  }>;
  providerRanking: Array<{
    name: string;
    uptime: number; // 0–100
    samples: number;
    incidents: number;
  }>;
  activity: Array<{
    id: string;
    level: LogLevel;
    source: LogSource;
    action: string;
    target: string;
    actor: string;
    createdAt: string;
  }>;
}

async function loadDashboard(): Promise<DashboardData> {
  const db = getDb();

  const [countsRow] = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM providers) AS providers,
      (SELECT COUNT(*)::int FROM models) AS models,
      (SELECT COUNT(*)::int FROM check_configs) AS configs_total,
      (SELECT COUNT(*)::int FROM check_configs WHERE enabled = true) AS configs_enabled,
      (SELECT COUNT(*)::int FROM check_configs WHERE is_maintenance = true) AS in_maint,
      (SELECT COUNT(*)::int FROM incidents WHERE status != 'resolved') AS active_incidents,
      (SELECT COUNT(*)::int FROM maintenances
        WHERE status IN ('scheduled','in_progress') AND scheduled_end > NOW())
        AS upcoming_maintenances,
      (SELECT COUNT(*)::int FROM announcements
        WHERE enabled = true AND starts_at <= NOW()
        AND (ends_at IS NULL OR ends_at > NOW())) AS announcements
  `)) as unknown as Array<Record<string, number>>;

  const providerNamesRows = (await db.execute(sql`
    SELECT name FROM providers ORDER BY id LIMIT 5
  `)) as unknown as Array<{ name: string }>;

  // 30 day uptime % + delta vs prior 30 days
  const [uptimeRow] = (await db.execute(sql`
    SELECT
      (SELECT
        CASE WHEN COUNT(*) > 0
          THEN ROUND(100.0 * SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) / COUNT(*), 2)
          ELSE NULL END
        FROM check_results
        WHERE checked_at > NOW() - INTERVAL '30 days') AS now30,
      (SELECT
        CASE WHEN COUNT(*) > 0
          THEN ROUND(100.0 * SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) / COUNT(*), 2)
          ELSE NULL END
        FROM check_results
        WHERE checked_at > NOW() - INTERVAL '60 days'
          AND checked_at <= NOW() - INTERVAL '30 days') AS prior30
  `)) as unknown as Array<{ now30: string | null; prior30: string | null }>;

  const recent = (await db.execute(sql`
    SELECT cr.id, cc.display_name AS name, cr.status::text AS status,
           cr.latency_ms, cr.checked_at
    FROM check_results cr
    JOIN check_configs cc ON cc.id = cr.config_id
    ORDER BY cr.checked_at DESC
    LIMIT 8
  `)) as unknown as Array<{
    id: number;
    name: string;
    status: string;
    latency_ms: number | null;
    checked_at: string;
  }>;

  const activeIncidentRows = (await db.execute(sql`
    SELECT i.id, i.title, i.status::text AS status, i.started_at,
      COALESCE(
        json_agg(cc.display_name ORDER BY cc.display_name) FILTER (WHERE cc.id IS NOT NULL),
        '[]'::json
      ) AS affected
    FROM incidents i
    LEFT JOIN incident_components ic ON ic.incident_id = i.id
    LEFT JOIN check_configs cc ON cc.id = ic.config_id
    WHERE i.status != 'resolved'
    GROUP BY i.id
    ORDER BY i.started_at DESC
    LIMIT 5
  `)) as unknown as Array<{
    id: number;
    title: string;
    status: string;
    started_at: string;
    affected: string[];
  }>;

  const providerRanking = (await db.execute(sql`
    SELECT
      p.name AS name,
      COUNT(cr.*)::int AS samples,
      CASE WHEN COUNT(cr.*) > 0
        THEN ROUND(100.0 * SUM(CASE WHEN cr.status = 'ok' THEN 1 ELSE 0 END) / COUNT(cr.*), 2)
        ELSE 100.0 END::float AS uptime
    FROM providers p
    LEFT JOIN models m ON m.provider_id = p.id
    LEFT JOIN check_configs cc ON cc.model_id = m.id
    LEFT JOIN check_results cr ON cr.config_id = cc.id AND cr.checked_at > NOW() - INTERVAL '30 days'
    GROUP BY p.id, p.name
    ORDER BY uptime DESC, samples DESC
    LIMIT 5
  `)) as unknown as Array<{ name: string; samples: number; uptime: number }>;

  // Per-provider incidents in last 30 days
  const incidentsByProvider = (await db.execute(sql`
    SELECT p.name AS name, COUNT(DISTINCT i.id)::int AS incidents
    FROM incidents i
    JOIN incident_components ic ON ic.incident_id = i.id
    JOIN check_configs cc ON cc.id = ic.config_id
    JOIN models m ON m.id = cc.model_id
    JOIN providers p ON p.id = m.provider_id
    WHERE i.started_at > NOW() - INTERVAL '30 days'
    GROUP BY p.name
  `)) as unknown as Array<{ name: string; incidents: number }>;
  const incidentsByName = new Map(incidentsByProvider.map((r) => [r.name, Number(r.incidents)]));

  // 活动日志对接「日志管理」的统一日志流（审计 / 探测 / Webhook / 系统）。
  const activity = await loadUnifiedLogs({ limit: 6 });

  const now30 = uptimeRow?.now30 != null ? Number(uptimeRow.now30) : 100;
  const prior30 = uptimeRow?.prior30 != null ? Number(uptimeRow.prior30) : now30;

  return {
    counts: {
      providers: Number(countsRow?.providers ?? 0),
      providerNames: providerNamesRows.map((r) => r.name),
      models: Number(countsRow?.models ?? 0),
      configsTotal: Number(countsRow?.configs_total ?? 0),
      configsEnabled: Number(countsRow?.configs_enabled ?? 0),
      inMaintConfigs: Number(countsRow?.in_maint ?? 0),
      activeIncidents: Number(countsRow?.active_incidents ?? 0),
      upcomingMaintenances: Number(countsRow?.upcoming_maintenances ?? 0),
      announcements: Number(countsRow?.announcements ?? 0),
    },
    uptime30d: { pct: now30, delta: Number((now30 - prior30).toFixed(2)) },
    recentChecks: recent.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      latencyMs: r.latency_ms,
      checkedAt: r.checked_at,
    })),
    activeIncidents: activeIncidentRows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      startedAt: r.started_at,
      affected: Array.isArray(r.affected) ? r.affected : [],
    })),
    providerRanking: providerRanking.map((p) => ({
      name: p.name,
      uptime: Number(p.uptime),
      samples: Number(p.samples),
      incidents: incidentsByName.get(p.name) ?? 0,
    })),
    activity: activity.map((a) => ({
      id: a.id,
      level: a.level,
      source: a.source,
      action: a.action,
      target: a.target,
      actor: a.actor,
      createdAt: a.at,
    })),
  };
}

export default async function AdminDashboard() {
  const data = await loadDashboard();
  const c = data.counts;

  return (
    <div>
      <header
        style={{
          marginBottom: 24,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>
            概览
          </h1>
          <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
            管理 Provider / 模型 / 探测配置，发布事件与维护通告
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <RefreshButton />
          <Link className="btn btn-primary" href="/admin/incidents">
            <Plus size={13} aria-hidden /> 新建事件
          </Link>
        </div>
      </header>

      {/* Stat cards: 4 columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Providers"
          value={c.providers}
          sub={c.providerNames.length > 0 ? c.providerNames.join(' · ') : '尚未配置'}
          icon={Boxes}
          href="/admin/providers"
        />
        <StatCard
          label="模型"
          value={c.models}
          sub="跨所有 Provider 已注册"
          icon={Boxes}
          href="/admin/models"
        />
        <StatCard
          label="组件"
          value={`${c.configsEnabled}/${c.configsTotal}`}
          sub="已启用 / 总数"
          icon={Boxes}
          href="/admin/configs"
        />
        <StatCard
          label="维护中组件"
          value={c.inMaintConfigs}
          tone={c.inMaintConfigs > 0 ? 'blue' : 'neutral'}
          sub="暂停探测"
          icon={Wrench}
          href="/admin/configs"
        />
        <StatCard
          label="进行中事件"
          value={c.activeIncidents}
          tone={c.activeIncidents > 0 ? 'rose' : 'neutral'}
          sub="需关注"
          icon={AlertTriangle}
          href="/admin/incidents"
        />
        <StatCard
          label="即将维护"
          value={c.upcomingMaintenances}
          tone={c.upcomingMaintenances > 0 ? 'amber' : 'neutral'}
          sub="未来 7 天"
          icon={Wrench}
          href="/admin/maintenances"
        />
        <StatCard
          label="生效公告"
          value={c.announcements}
          sub="对外可见"
          icon={Megaphone}
          href="/admin/announcements"
        />
        <StatCard
          label="30d 平均可用率"
          value={`${data.uptime30d.pct.toFixed(2)}%`}
          tone="green"
          delta={`${data.uptime30d.delta >= 0 ? '+' : ''}${data.uptime30d.delta.toFixed(2)}%`}
          sub="对比上 30 天"
          icon={LayoutDashboard}
        />
      </div>

      {/* Recent checks + Active incidents quick view */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <RecentChecksCard rows={data.recentChecks} />
        <ActiveIncidentsCard rows={data.activeIncidents} />
      </div>

      {/* Provider 30d uptime ranking + Activity log */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 16,
          marginTop: 16,
        }}
      >
        <ProviderRankingCard rows={data.providerRanking} />
        <ActivityLogCard rows={data.activity} />
      </div>
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────

const TONE_COLOR: Record<'neutral' | 'rose' | 'amber' | 'blue' | 'green', string | undefined> = {
  neutral: 'var(--fg)',
  rose: 'var(--st-major)',
  amber: 'var(--st-deg)',
  blue: 'var(--st-maint)',
  green: 'var(--st-op)',
};

function StatCard({
  label,
  value,
  sub,
  delta,
  tone = 'neutral',
  icon: Icon,
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  delta?: string;
  tone?: 'neutral' | 'rose' | 'amber' | 'blue' | 'green';
  icon: LucideIcon;
  href?: string;
}) {
  const card = (
    <div className="card lift" style={{ padding: 18, cursor: href ? 'pointer' : 'default' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span
          className="subtle"
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <span style={{ color: 'var(--fg-subtle)', display: 'inline-flex' }} aria-hidden>
          <Icon size={14} />
        </span>
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <span
          className="tabular"
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: TONE_COLOR[tone],
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </span>
        {delta && (
          <span
            className="tabular"
            style={{
              fontSize: 12,
              color: delta.startsWith('-')
                ? 'var(--st-major)'
                : delta.startsWith('+0.00')
                  ? 'var(--fg-muted)'
                  : 'var(--st-op)',
            }}
          >
            {delta}
          </span>
        )}
      </div>
      {sub && (
        <div className="subtle" style={{ fontSize: 11.5, marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
  if (href) return <Link href={href as never}>{card}</Link>;
  return card;
}

// ─── Recent checks ─────────────────────────────────────────

function RecentChecksCard({ rows }: { rows: DashboardData['recentChecks'] }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>最近探测</h2>
        <Link href="/admin/configs" className="subtle" style={{ fontSize: 12 }}>
          查看全部 →
        </Link>
      </div>
      {rows.length === 0 ? (
        <p
          className="subtle"
          style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, margin: 0 }}
        >
          尚无探测记录
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rows.map((r, i) => {
            const status =
              r.status === 'ok'
                ? 'operational'
                : r.status === 'degraded'
                  ? 'degraded'
                  : 'major_outage';
            const latencyColor =
              r.status === 'ok'
                ? 'var(--fg-muted)'
                : r.status === 'degraded'
                  ? 'var(--st-deg)'
                  : 'var(--st-major)';
            return (
              <li
                key={r.id}
                className="row"
                style={{
                  justifyContent: 'space-between',
                  padding: '9px 0',
                  borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div className="row" style={{ gap: 10 }}>
                  <span className={`dot dot-${status}`} aria-hidden />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                </div>
                <div className="row" style={{ gap: 14 }}>
                  <span className="tabular" style={{ fontSize: 12, color: latencyColor }}>
                    {r.latencyMs != null ? `${r.latencyMs} ms` : 'timeout'}
                  </span>
                  <span className="subtle tabular" style={{ fontSize: 11 }}>
                    {timeAgo(r.checkedAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Active incidents quick view ──────────────────────────

function ActiveIncidentsCard({ rows }: { rows: DashboardData['activeIncidents'] }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>需要关注</h2>
        <span className="badge badge-rose">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p
          className="subtle"
          style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, margin: 0 }}
        >
          一切正常
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((i) => (
            <Link
              key={i.id}
              href="/admin/incidents"
              className="lift"
              style={{
                padding: 12,
                border: '1px solid var(--border)',
                borderRadius: 8,
                textDecoration: 'none',
                color: 'inherit',
                display: 'block',
              }}
            >
              <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                <span className={`pill pill-${i.status}`}>
                  <span className={`dot dot-${i.status}`} aria-hidden />
                  {INCIDENT_STATUS_LABEL[i.status] ?? i.status}
                </span>
                <span className="subtle tabular" style={{ fontSize: 11 }}>
                  {timeAgo(i.startedAt)}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{i.title}</div>
              {i.affected.length > 0 && (
                <div className="subtle" style={{ fontSize: 11.5 }}>
                  影响：{i.affected.join('、')}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const INCIDENT_STATUS_LABEL: Record<string, string> = {
  investigating: '调查中',
  identified: '已定位',
  monitoring: '观察中',
  resolved: '已解决',
};

// ─── Provider 30d uptime ranking ─────────────────────────

function ProviderRankingCard({ rows }: { rows: DashboardData['providerRanking'] }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>各 Provider 30 天可用率</h2>
        <span className="subtle" style={{ fontSize: 11.5 }}>
          按可用率排序
        </span>
      </div>
      {rows.length === 0 ? (
        <p
          className="subtle"
          style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, margin: 0 }}
        >
          暂无数据
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((p) => {
            const pct = Math.max(0, Math.min(100, ((p.uptime - 97) / 3) * 100));
            const tone =
              p.uptime >= 99.9
                ? 'var(--st-op)'
                : p.uptime >= 99
                  ? 'var(--st-deg)'
                  : 'var(--st-part)';
            return (
              <div key={p.name}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                    <span className="subtle tabular" style={{ fontSize: 11 }}>
                      {p.samples.toLocaleString()} 次探测 · {p.incidents} 事件
                    </span>
                  </div>
                  <span
                    className="tabular"
                    style={{ fontSize: 12.5, fontWeight: 600, color: tone }}
                  >
                    {p.uptime.toFixed(2)}%
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: 'var(--bg-subtle)',
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: tone,
                      borderRadius: 999,
                      transition: 'width 600ms ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Activity log ─────────────────────────────────────────

// 日志来源中文标签 + 级别配色（与「日志管理」页一致）。
const LOG_SOURCE_LABEL: Record<LogSource, string> = {
  audit: '审计',
  probe: '探测',
  webhook: 'Webhook',
  system: '系统',
};

const LOG_LEVEL_BADGE: Record<LogLevel, string> = {
  debug: 'badge',
  info: 'badge badge-blue',
  warn: 'badge badge-amber',
  error: 'badge badge-rose',
};

function ActivityLogCard({ rows }: { rows: DashboardData['activity'] }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>活动日志</h2>
        <Link
          href="/admin/logs"
          className="subtle"
          style={{ fontSize: 12, textDecoration: 'none' }}
        >
          查看全部 →
        </Link>
      </div>
      {rows.length === 0 ? (
        <p
          className="subtle"
          style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, margin: 0 }}
        >
          尚无活动
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rows.map((a, i) => (
            <li
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '10px 0',
                borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <span
                className={LOG_LEVEL_BADGE[a.level]}
                style={{ fontSize: 10, marginTop: 2, whiteSpace: 'nowrap' }}
              >
                {LOG_SOURCE_LABEL[a.source]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {a.target}
                </div>
                <div
                  className="subtle"
                  style={{
                    fontSize: 11,
                    marginTop: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  <span className="mono">{a.action}</span> · {a.actor} · {timeAgo(a.createdAt)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Util ─────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const seconds = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}
