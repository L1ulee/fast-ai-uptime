import Link from 'next/link';
import { fmtUTC } from '@/components/public/format';
import { officialStatusLabel, type OfficialOverallStatus } from '@/lib/api/official-status-shared';
import { loadActiveUpstreamIncidents, loadMirrorsAdmin } from '@/lib/api/admin-aggregations';
import { ProviderMark } from '@/components/admin/provider-mark';
import { getSettings } from '@/lib/admin/settings';
import { makeT } from '@/lib/i18n';
import { REPO_URL } from '@/lib/version';

export const dynamic = 'force-dynamic';

interface MirrorView {
  mirrorId: number;
  name: string;
  providerType: string | null;
  statusUrl: string;
  status: OfficialOverallStatus;
  description: string | null;
  updatedAt: string | null;
  /** 24 段近 24 小时主导状态。 */
  hourly24: Array<string | null>;
}

function tokenColor(s: OfficialOverallStatus): string {
  switch (s) {
    case 'operational':
      return 'var(--st-op)';
    case 'degraded':
      return 'var(--st-deg)';
    case 'partial_outage':
      return 'var(--st-part)';
    case 'major_outage':
      return 'var(--st-major)';
    case 'maintenance':
      return 'var(--st-maint)';
    default:
      return 'var(--fg-muted)';
  }
}

function impactTone(impact: string | null): 'rose' | 'amber' | 'blue' | 'neutral' {
  switch (impact) {
    case 'critical':
    case 'major':
      return 'rose';
    case 'minor':
      return 'amber';
    case 'maintenance':
      return 'blue';
    default:
      return 'neutral';
  }
}

function impactBorderColor(impact: string | null): string {
  switch (impact) {
    case 'critical':
    case 'major':
      return 'var(--st-major)';
    case 'minor':
      return 'var(--st-part)';
    case 'maintenance':
      return 'var(--st-maint)';
    default:
      return 'var(--border)';
  }
}

function timeAgoI18n(
  d: string | null,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  if (!d) return '—';
  const sec = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (sec < 60) return t('upstream.timeAgo.sec', { n: sec });
  if (sec < 3600) return t('upstream.timeAgo.min', { n: Math.floor(sec / 60) });
  if (sec < 86400) return t('upstream.timeAgo.hour', { n: Math.floor(sec / 3600) });
  return t('upstream.timeAgo.day', { n: Math.floor(sec / 86400) });
}

/** impact 优先,缺失退到 kind;两者都会本地化。 */
function impactOrKindLabel(
  impact: string | null,
  kind: 'incident' | 'maintenance',
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  if (impact && impact !== 'none') {
    const key = `upstream.impact.${impact}`;
    const localized = t(key);
    // 字典命中:t() 返回与 key 不同的值。否则原样返回 impact 字符串。
    return localized === key ? impact : localized;
  }
  return t(`upstream.kind.${kind}`);
}

export default async function OfficialStatusPage() {
  const [mirrors, upstream, settings] = await Promise.all([
    loadMirrorsAdmin(),
    loadActiveUpstreamIncidents(),
    getSettings(),
  ]);
  const tz = settings.site.timezone;
  const t = makeT(settings.site.language);
  const mirrorsViews: MirrorView[] = mirrors
    .filter((m) => m.enabled)
    .map((m) => ({
      mirrorId: m.id,
      name: m.name,
      providerType: m.providerType,
      statusUrl: m.statusUrl,
      status: (m.latestStatus as OfficialOverallStatus | null) ?? 'unknown',
      description: m.latestDescription,
      updatedAt: m.latestFetchedAt,
      hourly24: m.hourly24,
    }));

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      <header className="sticky-header">
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
            height: 52,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div className="row" style={{ gap: 10 }}>
            {settings.branding.logoLight ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.branding.logoLight}
                alt={settings.site.name}
                style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'contain' }}
              />
            ) : (
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: 'var(--brand)',
                  color: 'var(--brand-fg)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 11,
                }}
                aria-hidden
              >
                {settings.site.name.slice(0, 3).toUpperCase() || 'FAU'}
              </div>
            )}
            <span style={{ fontSize: 14, fontWeight: 600 }}>{settings.site.name}</span>
            <span className="subtle" style={{ fontSize: 12 }}>
              · {settings.site.language === 'en' ? 'official mirrors' : '官方状态镜像'}
            </span>
          </div>
          <Link href="/" className="subtle" style={{ fontSize: 12, textDecoration: 'none' }}>
            ← {settings.site.language === 'en' ? 'Back to Status' : '返回状态页'}
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px 96px' }}>
        <div style={{ marginBottom: 32 }}>
          <div
            className="subtle"
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 8,
            }}
          >
            Upstream Mirrors
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 600,
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            各供应商官方状态
          </h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>
            来自 statuspage.io 兼容接口的镜像快照，按各源配置的周期定时拉取。本页反映上游
            自己声称的状态，与我们的主动探测可能存在偏差。
          </p>
        </div>

        {upstream.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <div
              className="row"
              style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}
            >
              <h2 className="section-h" style={{ margin: 0 }}>
                来自渠道的事件
                <span
                  className="subtle"
                  style={{ fontSize: 11, marginLeft: 10, fontWeight: 400, letterSpacing: 0 }}
                >
                  {upstream.length} 条
                </span>
              </h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upstream.map((inc) => (
                <a
                  key={`${inc.kind}-${inc.id}`}
                  href={inc.url ?? '#'}
                  target={inc.url ? '_blank' : undefined}
                  rel={inc.url ? 'noopener noreferrer' : undefined}
                  className="card lift"
                  style={{
                    padding: '14px 18px',
                    borderLeft: `3px solid ${impactBorderColor(inc.impact)}`,
                    textDecoration: 'none',
                    color: 'inherit',
                    display: 'block',
                  }}
                >
                  <div className="row" style={{ gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span className="badge mono" style={{ fontSize: 10.5 }}>
                      {inc.mirrorName}
                    </span>
                    <span className={`badge badge-${impactTone(inc.impact)}`}>
                      {impactOrKindLabel(inc.impact, inc.kind, t)}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{inc.title}</span>
                  </div>
                  <div className="subtle" style={{ fontSize: 12, marginBottom: 6 }}>
                    {inc.startedAt
                      ? `${t('upstream.started')} ${fmtUTC(inc.startedAt, tz)} · ${timeAgoI18n(inc.startedAt, t)}`
                      : t('upstream.timeUnknown')}
                  </div>
                  {inc.lastUpdateBody && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: 'var(--fg-muted)',
                        padding: '8px 12px',
                        background: 'var(--bg-muted)',
                        borderRadius: 6,
                        marginTop: 8,
                      }}
                    >
                      <span
                        className="subtle"
                        style={{
                          fontSize: 10.5,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          marginRight: 8,
                        }}
                      >
                        {t('upstream.updateLatest')}
                      </span>
                      {inc.lastUpdateBody}
                      {inc.lastUpdateAt && (
                        <span className="subtle tabular" style={{ fontSize: 11, marginLeft: 6 }}>
                          · {timeAgoI18n(inc.lastUpdateAt, t)}
                        </span>
                      )}
                    </div>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        {mirrorsViews.length === 0 ? (
          <div
            className="card"
            style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fg-muted)' }}
          >
            <div style={{ fontWeight: 500, marginBottom: 6 }}>尚未配置任何官方状态镜像</div>
            <div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
              在 /admin/official-status 中新增镜像后，本页会自动展示。
            </div>
          </div>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {mirrorsViews.map((p) => (
              <li key={p.mirrorId} className="card lift" style={{ padding: '18px 20px' }}>
                <div
                  className="row"
                  style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}
                >
                  <div className="row" style={{ gap: 12, minWidth: 0 }}>
                    <ProviderMark type={p.providerType ?? 'custom'} size={26} />
                    <div>
                      <div className="row" style={{ gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                        {p.providerType && (
                          <span className="badge mono" style={{ fontSize: 10.5 }}>
                            {p.providerType}
                          </span>
                        )}
                      </div>
                      <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                        {p.description ?? officialStatusLabel(p.status, settings.site.language)}
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 12 }}>
                    {p.updatedAt && (
                      <span className="subtle tabular" style={{ fontSize: 11.5 }}>
                        更新于 {fmtUTC(p.updatedAt, tz)}
                      </span>
                    )}
                    {p.statusUrl && (
                      <a
                        href={p.statusUrl}
                        className="btn btn-sm"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        官方页 ↗
                      </a>
                    )}
                  </div>
                </div>

                {/* 24h bar-strip */}
                <div style={{ marginTop: 14 }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                    <span
                      className="subtle"
                      style={{
                        fontSize: 10.5,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      过去 24 小时
                    </span>
                  </div>
                  <div
                    className="bar-strip bar-strip-static"
                    style={{ display: 'flex', gap: 1.5, height: 14 }}
                  >
                    {p.hourly24.map((status, i) => {
                      const s = (status as OfficialOverallStatus | null) ?? null;
                      const color = s ? tokenColor(s) : 'var(--bg-muted)';
                      const hoursAgo = 24 - i;
                      const head =
                        hoursAgo === 0 ? t('tip.now') : t('tip.hoursAgo', { n: hoursAgo });
                      return (
                        <div
                          key={i}
                          className="tip-wrap"
                          style={{
                            flex: 1,
                            background: color,
                            opacity: s ? 0.85 : 0.4,
                            borderRadius: 1.5,
                            minHeight: '100%',
                          }}
                        >
                          <div className="tip">
                            <div className="tip-head">{head}</div>
                            <div className="tip-grid">
                              <span className="tip-key">{t('tip.status')}</span>
                              <span>
                                {s
                                  ? officialStatusLabel(s, settings.site.language)
                                  : t('tip.noData')}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <footer style={{ marginTop: 64, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <div className="subtle" style={{ fontSize: 12 }}>
            © {new Date().getFullYear()}{' '}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--st-maint)', textDecoration: 'none' }}
            >
              {settings.site.name}
            </a>{' '}
            ·{' '}
            {settings.site.language === 'en'
              ? 'data from upstream provider status pages'
              : '数据来自各供应商公开状态页'}
          </div>
        </footer>
      </main>
    </div>
  );
}
