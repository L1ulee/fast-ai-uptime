import type { ReactNode } from 'react';
import Link from 'next/link';
import { getSettings } from '@/lib/admin/settings';
import type { ComponentStatus, OfficialSourceDto } from '@/lib/api/types';
import { makeT } from '@/lib/i18n';
import { Pill } from './pill';

const NAV_KEYS = [
  { id: 'status', i18n: 'nav.public.status', href: '/' as const },
  { id: 'maintenance', i18n: 'nav.public.maintenance', href: '/maintenance' as const },
  { id: 'incidents', i18n: 'nav.public.incidents', href: '/incidents' as const },
] as const;

interface Props {
  active: 'status' | 'maintenance' | 'incidents';
  overallStatus: ComponentStatus;
  officialSources: OfficialSourceDto[];
  /** 右侧额外槽位（主题切换器等） */
  children?: ReactNode;
}

const STATUS_RANK: Record<string, number> = {
  major_outage: 0,
  partial_outage: 1,
  degraded: 2,
  maintenance: 3,
  operational: 4,
  unknown: 5,
};

export async function PublicHeader({ active, overallStatus, officialSources, children }: Props) {
  const settings = await getSettings();
  const { site, branding, public: pub } = settings;
  const t = makeT(site.language);
  const sources = officialSources ?? [];
  const worst = sources
    .slice()
    .sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9))[0];
  const issueCount = sources.filter(
    (s) => s.status !== 'operational' && s.status !== 'unknown',
  ).length;

  const subscribeHref = site.supportEmail
    ? `mailto:${site.supportEmail}?subject=${encodeURIComponent('Status updates subscription')}`
    : null;

  return (
    <header className="sticky-header">
      <div
        className="public-header-grid"
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          minHeight: 60,
          padding: '10px 24px',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 16,
        }}
      >
        {/* Brand */}
        <div className="row" style={{ gap: 10, justifySelf: 'start', minWidth: 0 }}>
          <Link
            href="/"
            className="row"
            style={{ gap: 10, textDecoration: 'none', color: 'inherit' }}
          >
            {branding.logoLight ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoLight}
                alt={site.name}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  objectFit: 'contain',
                  flexShrink: 0,
                }}
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
                  flexShrink: 0,
                }}
                aria-hidden
              >
                {site.name.slice(0, 3).toUpperCase() || 'FAU'}
              </div>
            )}
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{site.name}</span>
          </Link>
        </div>

        {/* Center nav */}
        <nav
          className="row"
          style={{ gap: 2, justifySelf: 'center', flexWrap: 'wrap' }}
          aria-label="public-status sections"
        >
          {NAV_KEYS.map((item) => {
            const isActive = item.id === active;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  color: isActive ? 'var(--fg)' : 'var(--fg-muted)',
                  background: isActive ? 'var(--bg-subtle)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all 120ms',
                }}
              >
                {t(item.i18n)}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster */}
        <div className="row" style={{ gap: 10, justifySelf: 'end', flexShrink: 0 }}>
          <Pill status={overallStatus} en />
          {pub.showSubscribe && subscribeHref && (
            <a
              href={subscribeHref}
              title={t('nav.public.subscribeTitle')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                textDecoration: 'none',
                fontSize: 11.5,
                color: 'var(--fg)',
                whiteSpace: 'nowrap',
                fontWeight: 500,
              }}
            >
              ✉ {t('nav.public.subscribe')}
            </a>
          )}
          {worst && (
            <Link
              href="/official-status"
              title={t('nav.public.upstreamTitle')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px 4px 8px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                textDecoration: 'none',
                fontSize: 11.5,
                color: 'var(--fg-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                className={`dot dot-${worst.status}`}
                style={{ width: 7, height: 7 }}
                aria-hidden
              />
              <span style={{ fontWeight: 500, color: 'var(--fg)' }}>
                {t('nav.public.upstream')}
              </span>
              <span style={{ color: 'var(--fg-subtle)' }}>·</span>
              <span className="tabular">
                {issueCount === 0
                  ? t('nav.public.upstreamOk', { count: sources.length })
                  : t('nav.public.upstreamIssues', { count: issueCount })}
              </span>
            </Link>
          )}
          {children}
        </div>
      </div>
    </header>
  );
}
