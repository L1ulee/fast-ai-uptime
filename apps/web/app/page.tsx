import { cookies } from 'next/headers';
import Link from 'next/link';
import { fmtUTC } from '@/components/public/format';
import { GroupCard } from '@/components/public/group-card';
import type { HeatmapEvent } from '@/components/public/uptime-heatmap';
import { IncidentCard, type IncidentLike } from '@/components/public/incident-card';
import { IncidentDrawerProvider } from '@/components/public/incident-drawer-provider';
import { StatusDot } from '@/components/public/pill';
import { PublicFooter } from '@/components/public/public-footer';
import { PublicHeader } from '@/components/public/public-header';
import { RecentIncidentsTimeline } from '@/components/public/recent-incidents-timeline';
import { TweaksPanel } from '@/components/public/tweaks-panel';
import { buildStatusResponse } from '@/lib/api/build-status';
import { adminTweaksDefaults, getPublicShell } from '@/lib/admin/settings';
import type { ComponentStatus, StatusResponse } from '@/lib/api/types';

// 读取 cookies → 强制动态渲染。`revalidate` 与 `force-dynamic` 互斥，故省略。
export const dynamic = 'force-dynamic';

/** 聚合公开页热力图 tooltip 用的事件。按 id 去重后包含 active + 历史 incidents + 计划维护。 */
function buildHeatmapEvents(data: StatusResponse): HeatmapEvent[] {
  const seen = new Set<string>();
  const out: HeatmapEvent[] = [];
  for (const inc of [...data.activeIncidents, ...data.recentIncidents]) {
    const key = `inc-${inc.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: 'incident',
      id: inc.id,
      title: inc.title,
      status: inc.status,
      startedAt: inc.startedAt,
      affectedComponents: inc.affectedComponents,
    });
  }
  for (const m of data.scheduledMaintenances) {
    const key = `maint-${m.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: 'maintenance',
      id: m.id,
      title: m.title,
      status: m.status,
      scheduledStart: m.scheduledStart,
      affectedComponents: m.affectedComponents,
    });
  }
  return out;
}

const OVERALL_BANNER: Record<
  ComponentStatus,
  { en: string; cn: string; sub: string; icon: string }
> = {
  operational: {
    en: 'All Systems Operational',
    cn: '所有系统运行正常',
    sub: '当前所有探测均正常返回。',
    icon: '✓',
  },
  degraded: {
    en: 'Some Systems Degraded',
    cn: '部分系统延迟升高',
    sub: '可能影响响应速度但服务可用。',
    icon: '!',
  },
  partial_outage: {
    en: 'Partial System Outage',
    cn: '部分系统中断',
    sub: '部分服务受影响，正在调查并修复。',
    icon: '!',
  },
  major_outage: {
    en: 'Major Service Outage',
    cn: '重大故障',
    sub: '主要服务不可用。',
    icon: '✕',
  },
  maintenance: {
    en: 'Under Maintenance',
    cn: '计划维护中',
    sub: '部分功能在维护窗口内不可用。',
    icon: '⚙',
  },
  unknown: {
    en: 'Status Unknown',
    cn: '状态未知',
    sub: '尚未收到探测数据。',
    icon: '?',
  },
};

function bannerStatusKey(
  s: ComponentStatus,
): 'op' | 'deg' | 'part' | 'major' | 'maint' | 'unknown' {
  switch (s) {
    case 'operational':
      return 'op';
    case 'degraded':
      return 'deg';
    case 'partial_outage':
      return 'part';
    case 'major_outage':
      return 'major';
    case 'maintenance':
      return 'maint';
    case 'unknown':
      return 'unknown';
  }
}

export default async function HomePage() {
  const jar = await cookies();
  const { settings, tweaks } = await getPublicShell((name) => jar.get(name)?.value);

  const data: StatusResponse = await buildStatusResponse();
  const banner = OVERALL_BANNER[data.overallStatus];
  const sticky = data.overallStatus;
  const heatmapDays = tweaks.heatmapDays;
  const heroVariant = tweaks.heroVariant;
  const stKey = bannerStatusKey(sticky);

  // 聚合给 heatmap tooltip 显示的"当日事件"。去重（id）后展开 active + 历史 + 计划维护。
  const heatmapEvents = buildHeatmapEvents(data);

  return (
    <IncidentDrawerProvider referenceNow={data.now} siteTimezone={settings.site.timezone}>
      <PublicHeader active="status" overallStatus={sticky} officialSources={data.officialSources} />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 96px' }}>
        {/* Hero — 3 variants */}
        {heroVariant === 'panel' && (
          <section
            className="card"
            style={{
              padding: '28px 28px',
              borderColor: `color-mix(in oklab, var(--st-${stKey}) 35%, var(--border))`,
              background: `linear-gradient(180deg, var(--st-${stKey}-bg) 0%, var(--bg-elevated) 100%)`,
            }}
          >
            <div className="row" style={{ gap: 18, alignItems: 'center' }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 999,
                  background: `var(--st-${stKey})`,
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  fontWeight: 700,
                  flexShrink: 0,
                  boxShadow: `0 0 0 6px color-mix(in oklab, var(--st-${stKey}) 18%, transparent), 0 2px 12px color-mix(in oklab, var(--st-${stKey}) 35%, transparent)`,
                }}
                aria-hidden
              >
                {banner.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: `var(--st-${stKey})`,
                    }}
                  >
                    {banner.en}
                  </span>
                </div>
                <h1
                  style={{
                    fontSize: 26,
                    fontWeight: 600,
                    margin: 0,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.15,
                  }}
                >
                  {banner.cn}
                </h1>
                <p className="muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 0 }}>
                  {banner.sub} · 最后探测于{' '}
                  <span className="tabular">{fmtUTC(data.now, settings.site.timezone)}</span>
                </p>
              </div>
            </div>
          </section>
        )}

        {heroVariant === 'minimal' && (
          <section
            style={{
              padding: '12px 0 24px',
              borderBottom: '1px solid var(--border)',
              marginBottom: 24,
            }}
          >
            <div className="row" style={{ gap: 12 }}>
              <StatusDot status={sticky} pulse />
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}
              >
                {banner.cn}
              </h1>
              <span
                className={`s-${sticky}`}
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {banner.en}
              </span>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 6, marginBottom: 0 }}>
              {banner.sub} ·{' '}
              <span className="tabular">{fmtUTC(data.now, settings.site.timezone)}</span>
            </p>
          </section>
        )}

        {heroVariant === 'split' && (
          <section
            className="card"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}
          >
            <div
              style={{
                padding: 28,
                background: `var(--st-${stKey}-bg)`,
              }}
            >
              <div
                className={`s-${sticky}`}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}
              >
                {banner.en}
              </div>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  margin: '8px 0 0',
                  letterSpacing: '-0.01em',
                }}
              >
                {banner.cn}
              </h1>
            </div>
            <div
              style={{
                padding: 28,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div className="muted" style={{ fontSize: 13 }}>
                {banner.sub}
              </div>
              <div style={{ fontSize: 11.5, marginTop: 10, color: 'var(--fg-subtle)' }}>
                探测时间 <span className="tabular">{fmtUTC(data.now, settings.site.timezone)}</span>
              </div>
            </div>
          </section>
        )}

        {/* Announcements */}
        {data.announcements.length > 0 && (
          <section style={{ marginTop: 24 }}>
            {data.announcements.map((a) => (
              <div
                key={a.id}
                className="card"
                style={{
                  padding: '12px 16px',
                  borderColor: 'var(--st-maint)',
                  background: 'var(--st-maint-bg)',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  marginBottom: 10,
                }}
              >
                <span style={{ color: 'var(--st-maint)', fontWeight: 700, marginTop: 1 }}>i</span>
                <div style={{ fontSize: 13, color: 'var(--fg)' }}>{a.bodyMd}</div>
              </div>
            ))}
          </section>
        )}

        {/* Active incidents */}
        {data.activeIncidents.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 className="section-h">Active Incidents · 进行中事件</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.activeIncidents.map((i) => (
                <IncidentCard key={i.id} incident={i as IncidentLike} referenceNow={data.now} />
              ))}
            </div>
          </section>
        )}

        {/* Scheduled maintenances —— in_progress 全显示; scheduled 仅 notify_lead_minutes
            窗口内展示(过滤在 build-status SQL)。 */}
        {data.scheduledMaintenances.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 className="section-h">Scheduled Maintenances · 计划维护</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.scheduledMaintenances.map((m) => (
                <IncidentCard
                  key={`maint-${m.id}`}
                  incident={m as IncidentLike}
                  type="maintenance"
                  referenceNow={data.now}
                />
              ))}
            </div>
          </section>
        )}

        {/* Service components */}
        <section style={{ marginTop: 32 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 className="section-h" style={{ margin: 0 }}>
              Service Components · 服务组件
            </h2>
            <span className="subtle" style={{ fontSize: 11 }}>
              过去 {heatmapDays} 天可用率
            </span>
          </div>
          {data.groups.length === 0 ? (
            <div
              className="card"
              style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fg-muted)' }}
            >
              <div style={{ fontWeight: 500, marginBottom: 6 }}>尚无监控组件</div>
              <div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
                在管理后台添加 Provider / 模型 / 探测组件后，公开页将自动展示。
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {data.groups.map((g, i) => (
                <GroupCard
                  key={`${g.id ?? 'ungrouped'}-${i}`}
                  group={g}
                  heatmapDays={heatmapDays}
                  events={heatmapEvents}
                />
              ))}
            </div>
          )}
        </section>

        {/* Recent incidents */}
        {data.recentIncidents.length > 0 && (
          <section style={{ marginTop: 40 }}>
            <div
              className="row"
              style={{ justifyContent: 'space-between', marginBottom: 12, alignItems: 'baseline' }}
            >
              <h2 className="section-h" style={{ margin: 0 }}>
                Recent Incidents · 最近事件
                <span
                  className="subtle"
                  style={{ fontSize: 11, marginLeft: 10, fontWeight: 400, letterSpacing: 0 }}
                >
                  显示最近 {Math.min(3, data.recentIncidents.length)} 条
                </span>
              </h2>
              <Link href="/incidents" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                查看全部 →
              </Link>
            </div>
            <RecentIncidentsTimeline incidents={data.recentIncidents.slice(0, 3)} now={data.now} />
          </section>
        )}

        <PublicFooter />
      </main>

      {settings.tweaks.enabled && (
        <TweaksPanel
          initial={tweaks}
          adminDefaults={adminTweaksDefaults(settings)}
          allowOverride={settings.tweaks.allowVisitorOverride}
        />
      )}
    </IncidentDrawerProvider>
  );
}
