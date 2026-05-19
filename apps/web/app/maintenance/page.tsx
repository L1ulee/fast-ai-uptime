import { cookies } from 'next/headers';
import { IncidentCard, type IncidentLike } from '@/components/public/incident-card';
import { IncidentDrawerProvider } from '@/components/public/incident-drawer-provider';
import { MonthRangeNav } from '@/components/public/month-range-nav';
import { PublicFooter } from '@/components/public/public-footer';
import { PublicHeader } from '@/components/public/public-header';
import { TweaksPanel } from '@/components/public/tweaks-panel';
import { buildStatusResponse } from '@/lib/api/build-status';
import {
  bucketByMonth,
  loadMaintenancesForRange,
  monthFull,
  monthLabel,
  monthsRange,
} from '@/lib/api/history';
import { adminTweaksDefaults, getPublicShell } from '@/lib/admin/settings';
import { makeT } from '@/lib/i18n';

// 读取 cookies → 强制动态渲染。`revalidate` 与 `force-dynamic` 互斥，故省略。
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ offset?: string }>;
}

function parseOffset(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 240);
}

export default async function PublicMaintenancePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const offset = parseOffset(sp.offset);
  const { start, end, months } = monthsRange(offset);

  const jar = await cookies();
  const { settings, tweaks } = await getPublicShell((name) => jar.get(name)?.value);

  const [status, maints] = await Promise.all([
    buildStatusResponse(),
    loadMaintenancesForRange(start, end),
  ]);

  const lang = settings.site.language;
  const t = makeT(lang);
  const buckets = bucketByMonth(maints, months);
  const rangeLabel = `${monthLabel(months[0]!, lang)} ${t('page.range.to')} ${monthLabel(months[2]!, lang)}`;

  return (
    <IncidentDrawerProvider referenceNow={status.now} siteTimezone={settings.site.timezone}>
      <PublicHeader
        active="maintenance"
        overallStatus={status.overallStatus}
        officialSources={status.officialSources}
      />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 96px' }}>
        <h1
          style={{
            fontSize: 38,
            fontWeight: 700,
            textAlign: 'center',
            margin: '24px 0 16px',
            letterSpacing: '-0.02em',
          }}
        >
          {t('page.maintenance.title')}
        </h1>
        <MonthRangeNav basePath="/maintenance" offset={offset} rangeLabel={rangeLabel} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {buckets.map((m) => (
            <section key={m.ym} className="card" style={{ overflow: 'hidden' }}>
              <div
                style={{
                  padding: '20px 20px 16px',
                  fontSize: 15,
                  fontWeight: 500,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {monthFull(m.date, lang)}
              </div>
              {m.items.length === 0 ? (
                <div
                  style={{
                    padding: '60px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    color: 'var(--fg-muted)',
                    fontSize: 14,
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 999,
                      background: 'var(--fg-subtle)',
                      color: 'var(--bg)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                    aria-hidden
                  >
                    ✓
                  </span>
                  {t('page.maintenance.empty')}
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    padding: 20,
                  }}
                >
                  {m.items.map((i) => (
                    <IncidentCard
                      key={i.id}
                      incident={i as IncidentLike}
                      type="maintenance"
                      referenceNow={status.now}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>

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
