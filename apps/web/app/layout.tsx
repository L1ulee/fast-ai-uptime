import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { ThemeProvider } from '@/components/theme-provider';
import { getPublicShell, getSettings } from '@/lib/admin/settings';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/** Admin "Site" 与 "Branding" 决定的页面元数据。每个请求重读 app_settings。 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const { site, branding, public: pub } = settings;
  const meta: Metadata = {
    title: site.name,
    description: site.description,
    robots: pub.allowIndexing ? undefined : { index: false, follow: false },
  };
  if (site.url) {
    try {
      meta.metadataBase = new URL(site.url);
    } catch {
      // 无效 URL 静默忽略
    }
  }
  if (branding.favicon) {
    meta.icons = { icon: branding.favicon };
  }
  return meta;
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const { settings, tweaks } = await getPublicShell((name) => jar.get(name)?.value);

  // 把 admin 配置的品牌色注入到 :root 与 [data-theme="dark"] 中。
  // 仅 inline 一行 <style> —— 让所有现有 CSS 引用 var(--brand) 自动跟随 admin。
  const brandColor = settings.branding.brandColor || '#34d399';
  const brandCss = `:root{--brand:${brandColor};}[data-theme="dark"]{--brand:${brandColor};}`;

  // ThemeProvider 默认主题来自 admin tweaks.defaultTheme。
  // allowVisitorOverride=false 时锁定主题(forcedTheme),disable next-themes 切换。
  const themeDefault = settings.tweaks.defaultTheme;
  const themeForced = settings.tweaks.allowVisitorOverride ? undefined : themeDefault;

  return (
    <html
      lang={settings.site.language === 'en' ? 'en' : 'zh-CN'}
      suppressHydrationWarning
      data-density={tweaks.density}
      data-saturation={tweaks.saturation}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: brandCss }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider
          attribute="data-theme"
          defaultTheme={themeDefault}
          enableSystem
          disableTransitionOnChange
          forcedTheme={themeForced}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
