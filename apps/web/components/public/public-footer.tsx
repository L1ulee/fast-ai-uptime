import Link from 'next/link';
import { getSettings } from '@/lib/admin/settings';
import { makeT } from '@/lib/i18n';
import { REPO_URL } from '@/lib/version';

/** 三个公开视图（Status / Maintenance / Previous incidents）共用的页脚。
    站点名/支持邮箱/Powered-by 等显式开关来自 admin app_settings。 */
export async function PublicFooter() {
  const { site, public: pub } = await getSettings();
  const t = makeT(site.language);
  const year = new Date().getFullYear();
  return (
    <footer
      style={{
        marginTop: 64,
        paddingTop: 24,
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <div className="subtle row" style={{ fontSize: 12, gap: 10, flexWrap: 'wrap' }}>
        <span>
          © {year}{' '}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--st-maint)', textDecoration: 'none' }}
          >
            {site.name}
          </a>
        </span>
        {pub.showPoweredBy && site.name !== 'Fast AI Uptime' && (
          <span style={{ color: 'var(--fg-subtle)' }}>
            ·{' '}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--st-maint)', textDecoration: 'none' }}
            >
              {t('footer.poweredBy')}
            </a>
          </span>
        )}
      </div>
      <div className="row" style={{ gap: 16, fontSize: 12, flexWrap: 'wrap' }}>
        {site.supportEmail && (
          <a href={`mailto:${site.supportEmail}`} className="subtle">
            {t('footer.support')}
          </a>
        )}
        <Link href="/api/v1/status" className="subtle">
          {t('footer.api')}
        </Link>
        <Link href="/admin/subscriptions" className="subtle">
          {t('footer.webhook')}
        </Link>
        <Link href="/api/healthz" className="subtle">
          {t('footer.health')}
        </Link>
        <Link href="/admin" className="subtle">
          {t('footer.admin')}
        </Link>
      </div>
    </footer>
  );
}
