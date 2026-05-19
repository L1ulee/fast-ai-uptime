import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  checkLoginAllowed,
  isAuthenticated,
  loginWithPassword,
  recordLoginAttempt,
} from '@/lib/auth';
import { getClientIp } from '@/lib/auth/client-ip';
import { logAudit } from '@/lib/admin/audit';
import { getSettings } from '@/lib/admin/settings';
import { makeT } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string; retry?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  if (await isAuthenticated()) {
    redirect('/admin');
  }
  const sp = await searchParams;
  const settings = await getSettings();
  const t = makeT(settings.site.language);

  let error: string | null = null;
  if (sp.error === '1') error = t('login.err.bad');
  else if (sp.error === '2') {
    const r = Number(sp.retry);
    error =
      Number.isFinite(r) && r > 0
        ? t('login.err.lockedMin', { min: Math.ceil(r / 60) })
        : t('login.err.locked');
  }
  const next = sp.next ?? '/admin';

  async function login(formData: FormData) {
    'use server';
    const password = String(formData.get('password') ?? '');
    const nextPath = String(formData.get('next') ?? '/admin');
    const ip = await getClientIp();
    const guard = checkLoginAllowed(ip);
    if (!guard.allowed) {
      await logAudit('auth.login_blocked', ip, { retryAfter: guard.retryAfterSeconds });
      const safeNext = encodeURIComponent(nextPath);
      redirect(`/login?error=2&retry=${guard.retryAfterSeconds ?? ''}&next=${safeNext}`);
    }
    const ok = await loginWithPassword(password);
    recordLoginAttempt(ip, ok);
    if (!ok) {
      await logAudit('auth.login_failed', ip);
      const safeNext = encodeURIComponent(nextPath);
      redirect(`/login?error=1&next=${safeNext}`);
    }
    await logAudit('auth.login_ok', ip);
    redirect(safeRedirect(nextPath));
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Brand */}
        <div className="row" style={{ justifyContent: 'center', marginBottom: 28, gap: 10 }}>
          {settings.branding.logoLight ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.branding.logoLight}
              alt={settings.site.name}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                objectFit: 'contain',
              }}
            />
          ) : (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--brand)',
                color: 'var(--brand-fg)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
              }}
              aria-hidden
            >
              {settings.site.name.slice(0, 3).toUpperCase() || 'FAU'}
            </div>
          )}
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{settings.site.name}</div>
            <div className="subtle" style={{ fontSize: 11.5 }}>
              {t('login.brand')}
            </div>
          </div>
        </div>

        <form action={login} className="card" style={{ padding: 28 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{t('login.title')}</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 6, marginBottom: 22 }}>
            {t('login.subtitle')}
          </p>

          <input type="hidden" name="next" value={next} />

          <label style={{ display: 'block', marginBottom: 18 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                display: 'block',
                marginBottom: 6,
                color: 'var(--fg-muted)',
              }}
            >
              {t('login.passwordLabel')}
            </span>
            <input
              type="password"
              name="password"
              required
              autoFocus
              className="input"
              placeholder={t('login.passwordPlaceholder')}
            />
            {error && (
              <div style={{ fontSize: 12, color: 'var(--st-major)', marginTop: 6 }}>{error}</div>
            )}
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', height: 38, justifyContent: 'center' }}
          >
            {t('login.submit')}
          </button>

          <div className="divider" />

          <div className="subtle" style={{ fontSize: 11.5, textAlign: 'center' }}>
            <Link href="/" className="subtle" style={{ textDecoration: 'none' }}>
              {t('login.backToPublic')}
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

/** 防止开放重定向：仅允许同站绝对路径。 */
function safeRedirect(path: string): string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    return '/admin';
  }
  return path;
}
