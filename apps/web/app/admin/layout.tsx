import { ExternalLink, LogOut } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NavLinks, type NavSection } from '@/components/admin/nav-links';
import { ThemeToggle } from '@/components/theme-toggle';
import { getAdminLiveStatus, getAdminNavCounts } from '@/lib/admin/overall-status';
import { getSettings } from '@/lib/admin/settings';
import { makeT } from '@/lib/i18n';
import { isAuthenticated, logout } from '@/lib/auth';
import { getLatestVersion } from '@/lib/version';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) {
    redirect('/login');
  }
  const [status, counts, settings, versionInfo] = await Promise.all([
    getAdminLiveStatus(),
    getAdminNavCounts(),
    getSettings(),
    getLatestVersion(),
  ]);
  const t = makeT(settings.site.language);

  const sections: NavSection[] = [
    {
      title: t('admin.section.monitor'),
      items: [
        { href: '/admin', label: t('admin.nav.overview'), icon: 'dashboard' },
        {
          href: '/admin/configs',
          label: t('admin.nav.configs'),
          icon: 'components',
          count: counts.configs,
        },
      ],
    },
    {
      title: t('admin.section.config'),
      items: [
        {
          href: '/admin/providers',
          label: t('admin.nav.providers'),
          icon: 'components',
          count: counts.providers,
        },
        {
          href: '/admin/models',
          label: t('admin.nav.models'),
          icon: 'components',
          count: counts.models,
        },
        {
          href: '/admin/groups',
          label: t('admin.nav.groups'),
          icon: 'components',
          count: counts.groups,
        },
      ],
    },
    {
      title: t('admin.section.comms'),
      items: [
        {
          href: '/admin/incidents',
          label: t('admin.nav.incidents'),
          icon: 'incidents',
          count: counts.incidents,
          accent: counts.incidents > 0 ? 'rose' : undefined,
        },
        {
          href: '/admin/maintenances',
          label: t('admin.nav.maintenances'),
          icon: 'maint',
          count: counts.maintenances,
        },
        { href: '/admin/announcements', label: t('admin.nav.announcements'), icon: 'ann' },
        {
          href: '/admin/subscriptions',
          label: t('admin.nav.webhook'),
          icon: 'webhook',
          count: counts.webhooks,
        },
      ],
    },
    {
      title: t('admin.section.integrations'),
      items: [
        { href: '/admin/official-status', label: t('admin.nav.officialStatus'), icon: 'globe' },
      ],
    },
    {
      title: t('admin.section.system'),
      items: [
        { href: '/admin/logs', label: t('admin.nav.logs'), icon: 'logs' },
        { href: '/admin/settings', label: t('admin.nav.settings'), icon: 'settings' },
      ],
    },
  ];

  async function doLogout() {
    'use server';
    await logout();
    redirect('/login');
  }

  // Live-status card 的颜色与文案：基于 status.kind
  const liveOk = status.kind === 'operational';
  const liveTone = liveOk ? 'op' : 'part';
  const liveTitleColor = `var(--st-${liveTone})`;
  const liveBg = `var(--st-${liveTone}-bg)`;
  const liveTitle = liveOk ? t('admin.live.ok') : t('admin.live.partial');
  const liveSub =
    status.kind === 'busy'
      ? t('admin.live.busyTpl', {
          incidents: status.pendingIncidents,
          maintenances: status.pendingMaintenances,
        })
      : t('admin.live.allOk');

  return (
    <div
      className="admin-shell"
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg)',
      }}
    >
      {/* Sidebar */}
      <aside
        className="admin-sidebar"
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'sticky',
          top: 0,
        }}
      >
        {/* Brand */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Link
            href="/admin"
            className="row"
            style={{ gap: 10, textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}
          >
            {settings.branding.logoLight ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.branding.logoLight}
                alt={settings.site.name}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  objectFit: 'contain',
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: 'var(--brand)',
                  color: 'var(--brand-fg)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 11.5,
                  flexShrink: 0,
                }}
                aria-hidden
              >
                {settings.site.name.slice(0, 3).toUpperCase() || 'FAU'}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {settings.site.name}
              </div>
              <div className="subtle" style={{ fontSize: 10.5 }}>
                {t('admin.console')}
              </div>
            </div>
          </Link>
          {/* 版本号从 GitHub release 拉取(1h ISR);拉不到回退到 package.json。
              单独的 <a> 避免与 Link 嵌套形成无效的 a-in-a。 */}
          <a
            href={versionInfo.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={
              versionInfo.source === 'github'
                ? t('admin.footer.repo')
                : `${t('admin.footer.repo')} (local)`
            }
            className="mono"
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--bg-subtle)',
              color: 'var(--fg-muted)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            v{versionInfo.version}
          </a>
        </div>

        {/* Live status card */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div
            className="card"
            style={{ padding: 10, background: liveBg, borderColor: 'transparent' }}
          >
            <div className="row" style={{ gap: 8 }}>
              <span
                className={`dot dot-${liveOk ? 'operational' : 'partial_outage'} ${liveOk ? '' : 'dot-pulse'}`}
                aria-hidden
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: liveTitleColor }}>
                  {liveTitle}
                </div>
                <div className="subtle" style={{ fontSize: 10.5, marginTop: 1 }}>
                  {liveSub}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <NavLinks sections={sections} />

        {/* Footer */}
        <div
          style={{
            padding: '12px 14px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div className="row" style={{ justifyContent: 'space-between', padding: '0 6px 6px' }}>
            <span
              className="subtle"
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              {t('admin.theme')}
            </span>
            <ThemeToggle />
          </div>
          <Link
            href="/"
            className="row subtle"
            style={{
              fontSize: 12,
              padding: '5px 6px',
              borderRadius: 5,
              gap: 8,
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={12} aria-hidden /> {t('admin.publicPage')}
          </Link>
          <Link
            href="/official-status"
            className="row subtle"
            style={{
              fontSize: 12,
              padding: '5px 6px',
              borderRadius: 5,
              gap: 8,
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={12} aria-hidden /> {t('admin.officialMirror')}
          </Link>
          <form action={doLogout}>
            <button
              type="submit"
              className="row subtle"
              style={{
                fontSize: 12,
                padding: '5px 6px',
                borderRadius: 5,
                gap: 8,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                color: 'var(--fg-muted)',
              }}
            >
              <LogOut size={12} aria-hidden /> {t('admin.logout')}
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <main
        className="admin-main"
        style={{
          flex: 1,
          minWidth: 0,
          padding: '32px 40px',
          overflow: 'auto',
        }}
      >
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>{children}</div>
      </main>
    </div>
  );
}
