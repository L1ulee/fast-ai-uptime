import { appSettings, getDb } from '@fau/db';
import { type Lang } from '@/lib/i18n';
import { type Tweaks, readTweaksFromCookies } from '@/lib/tweaks';

/**
 * 系统设置的强类型 schema（支撑 /admin/settings）。
 * 每个 section 在 app_settings 表里存一行（key = section 名，value = jsonb）。
 */
export interface SiteSettings {
  name: string;
  url: string;
  description: string;
  supportEmail: string;
  timezone: string;
  /** 站点界面默认语言;影响未做双语标记的导航/页脚文案。 */
  language: Lang;
}

export interface BrandingSettings {
  /** data URL 或外链；null 表示用内置 FAU 占位。 */
  logoLight: string | null;
  logoDark: string | null;
  favicon: string | null;
  brandColor: string;
}

export interface PublicSettings {
  heroVariant: 'panel' | 'minimal' | 'split';
  heatmapDays: 30 | 60 | 90;
  allowIndexing: boolean;
  showPoweredBy: boolean;
  showSubscribe: boolean;
}

export interface TweaksSettings {
  enabled: boolean;
  defaultTheme: 'light' | 'dark' | 'system';
  defaultDensity: 'compact' | 'standard' | 'comfortable';
  defaultSaturation: 'muted' | 'rich';
  allowVisitorOverride: boolean;
}

export interface ProbeSettings {
  intervalSec: number;
  timeoutMs: number;
  retries: number;
  userAgent: string;
}

export interface LogsSettings {
  minLevel: 'debug' | 'info' | 'warn' | 'error';
  retention: { audit: number; probe: number; webhook: number; system: number };
  redactAuth: boolean;
  redactBody: boolean;
  forward: { enabled: boolean; url: string; format: 'json' | 'ndjson' | 'otlp' };
  cleanupHour: number;
  samplingRate: number;
}

export interface SettingsConfig {
  site: SiteSettings;
  branding: BrandingSettings;
  public: PublicSettings;
  tweaks: TweaksSettings;
  probe: ProbeSettings;
  logs: LogsSettings;
}

export type SettingsSection = keyof SettingsConfig;

export const DEFAULT_SETTINGS: SettingsConfig = {
  site: {
    name: 'Fast AI Uptime',
    url: 'https://status.fastai.example',
    description: '面向开发者的 AI Provider 主动探测与公开状态页。',
    supportEmail: 'support@fastai.example',
    timezone: 'Asia/Shanghai',
    language: 'zh',
  },
  branding: {
    logoLight: '/icon.png',
    logoDark: '/icon.png',
    favicon: '/favicon.png',
    brandColor: '#34d399',
  },
  public: {
    heroVariant: 'panel',
    heatmapDays: 90,
    allowIndexing: true,
    showPoweredBy: false,
    showSubscribe: true,
  },
  tweaks: {
    enabled: true,
    defaultTheme: 'dark',
    defaultDensity: 'standard',
    defaultSaturation: 'rich',
    allowVisitorOverride: true,
  },
  probe: {
    intervalSec: 60,
    timeoutMs: 15000,
    retries: 2,
    userAgent: 'FAU-Probe/1.3 (+https://status.fastai.example)',
  },
  logs: {
    minLevel: 'info',
    retention: { audit: 365, probe: 90, webhook: 60, system: 30 },
    redactAuth: true,
    redactBody: false,
    forward: { enabled: false, url: '', format: 'json' },
    cleanupHour: 3,
    samplingRate: 100,
  },
};

/** 浅合并：用 stored 覆盖 default 的顶层键（每个 section 自身整体覆盖）。 */
function mergeSection<T>(fallback: T, stored: unknown): T {
  if (stored == null || typeof stored !== 'object') return fallback;
  return { ...fallback, ...(stored as Partial<T>) };
}

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asStr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

/** brandColor 必须是 CSS color literal —— 防止 `}…</style><script>` 注入。 */
const BRAND_COLOR_RE =
  /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|hsl)a?\([\d\s,%.+\-/]+\))$/i;

function safeBrandColor(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const t = v.trim();
  return BRAND_COLOR_RE.test(t) ? t : fallback;
}

/**
 * logo/favicon 必须是 `data:image/…;base64,…` 或 https?:// URL,且总长 <= 200 KB.
 * 阻止 javascript: 协议、超大 base64 撑爆 app_settings 行。
 */
// http:// 会被 CSP img-src 'self' data: https: 阻挡,所以也不允许;只接受:
//   - data:image/...;base64,... (admin 上传)
//   - https://...               (外链)
//   - /...                       (站内相对路径,例如打包好的默认 logo /icon.png)
const IMAGE_URL_RE =
  /^(data:image\/(png|jpeg|jpg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+|https:\/\/[^\s<>"']{1,2000}|\/[A-Za-z0-9_\-.][A-Za-z0-9_\-./]{0,499})$/i;
const IMAGE_URL_MAX_LEN = 200 * 1024;

function safeImageUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  if (t.length > IMAGE_URL_MAX_LEN) return null;
  return IMAGE_URL_RE.test(t) ? t : null;
}

/**
 * 校验并归一化来自客户端的设置 payload（server action 入口处使用）。
 * 未知字段丢弃、数值 clamp、枚举回退到默认值。
 */
export function coerceSettings(raw: unknown): SettingsConfig {
  const r = (raw ?? {}) as Partial<Record<SettingsSection, Record<string, unknown>>>;
  const d = DEFAULT_SETTINGS;
  const site = r.site ?? {};
  const branding = r.branding ?? {};
  const pub = r.public ?? {};
  const tweaks = r.tweaks ?? {};
  const probe = r.probe ?? {};
  const logs = (r.logs ?? {}) as Record<string, unknown>;
  const retention = (logs.retention ?? {}) as Record<string, unknown>;
  const forward = (logs.forward ?? {}) as Record<string, unknown>;
  return {
    site: {
      name: asStr(site.name, d.site.name).slice(0, 200),
      url: asStr(site.url, d.site.url).slice(0, 500),
      description: asStr(site.description, d.site.description).slice(0, 1000),
      supportEmail: asStr(site.supportEmail, d.site.supportEmail).slice(0, 200),
      timezone: asStr(site.timezone, d.site.timezone).slice(0, 100),
      language: pickEnum(site.language, ['zh', 'en'] as const, d.site.language),
    },
    branding: {
      logoLight: safeImageUrl(branding.logoLight),
      logoDark: safeImageUrl(branding.logoDark),
      favicon: safeImageUrl(branding.favicon),
      brandColor: safeBrandColor(branding.brandColor, d.branding.brandColor),
    },
    public: {
      heroVariant: pickEnum(
        pub.heroVariant,
        ['panel', 'minimal', 'split'] as const,
        d.public.heroVariant,
      ),
      heatmapDays: ([30, 60, 90] as const).includes(Number(pub.heatmapDays) as 30 | 60 | 90)
        ? (Number(pub.heatmapDays) as 30 | 60 | 90)
        : d.public.heatmapDays,
      allowIndexing: asBool(pub.allowIndexing, d.public.allowIndexing),
      showPoweredBy: asBool(pub.showPoweredBy, d.public.showPoweredBy),
      showSubscribe: asBool(pub.showSubscribe, d.public.showSubscribe),
    },
    tweaks: {
      enabled: asBool(tweaks.enabled, d.tweaks.enabled),
      defaultTheme: pickEnum(
        tweaks.defaultTheme,
        ['light', 'dark', 'system'] as const,
        d.tweaks.defaultTheme,
      ),
      defaultDensity: pickEnum(
        tweaks.defaultDensity,
        ['compact', 'standard', 'comfortable'] as const,
        d.tweaks.defaultDensity,
      ),
      defaultSaturation: pickEnum(
        tweaks.defaultSaturation,
        ['muted', 'rich'] as const,
        d.tweaks.defaultSaturation,
      ),
      allowVisitorOverride: asBool(tweaks.allowVisitorOverride, d.tweaks.allowVisitorOverride),
    },
    probe: {
      intervalSec: clampNum(probe.intervalSec, 10, 86400, d.probe.intervalSec),
      timeoutMs: clampNum(probe.timeoutMs, 1000, 120000, d.probe.timeoutMs),
      retries: clampNum(probe.retries, 0, 5, d.probe.retries),
      userAgent: asStr(probe.userAgent, d.probe.userAgent).slice(0, 300),
    },
    logs: {
      minLevel: pickEnum(
        logs.minLevel,
        ['debug', 'info', 'warn', 'error'] as const,
        d.logs.minLevel,
      ),
      retention: {
        audit: clampNum(retention.audit, 1, 3650, d.logs.retention.audit),
        probe: clampNum(retention.probe, 1, 3650, d.logs.retention.probe),
        webhook: clampNum(retention.webhook, 1, 3650, d.logs.retention.webhook),
        system: clampNum(retention.system, 1, 3650, d.logs.retention.system),
      },
      redactAuth: asBool(logs.redactAuth, d.logs.redactAuth),
      redactBody: asBool(logs.redactBody, d.logs.redactBody),
      forward: {
        enabled: asBool(forward.enabled, d.logs.forward.enabled),
        url: asStr(forward.url, d.logs.forward.url).slice(0, 500),
        format: pickEnum(
          forward.format,
          ['json', 'ndjson', 'otlp'] as const,
          d.logs.forward.format,
        ),
      },
      cleanupHour: clampNum(logs.cleanupHour, 0, 23, d.logs.cleanupHour),
      samplingRate: clampNum(logs.samplingRate, 5, 100, d.logs.samplingRate),
    },
  };
}

/**
 * 把 admin 设置中"影响访客 Tweaks 的字段"合成为 Tweaks struct。
 *
 *   public.heroVariant      -> Tweaks.heroVariant
 *   public.heatmapDays      -> Tweaks.heatmapDays
 *   tweaks.defaultDensity   -> Tweaks.density
 *   tweaks.defaultSaturation-> Tweaks.saturation
 *
 * 注意 tweaks.defaultTheme 不在 Tweaks 中(由 ThemeProvider 单独管理)。
 */
export function adminTweaksDefaults(cfg: SettingsConfig): Tweaks {
  return {
    heroVariant: cfg.public.heroVariant,
    heatmapDays: cfg.public.heatmapDays,
    density: cfg.tweaks.defaultDensity,
    saturation: cfg.tweaks.defaultSaturation,
  };
}

/**
 * 一站式获取"对外可见"的 admin 设置 + 应用了 cookie 与开关后的最终 Tweaks。
 *
 * 优先级:cookie > admin 默认 > 内置常量;但 admin 关闭 allowVisitorOverride 时
 * 直接忽略 cookie,以 admin 默认值为准。
 */
export async function getPublicShell(
  cookieGet: (name: string) => string | undefined,
): Promise<{ settings: SettingsConfig; tweaks: Tweaks }> {
  const settings = await getSettings();
  const tweaks = readTweaksFromCookies(cookieGet, {
    defaults: adminTweaksDefaults(settings),
    allowOverride: settings.tweaks.allowVisitorOverride,
  });
  return { settings, tweaks };
}

/** 从 app_settings 读取全部设置，与默认值合并。 */
export async function getSettings(): Promise<SettingsConfig> {
  const db = getDb();
  let rows: Array<{ key: string; value: unknown }> = [];
  try {
    rows = await db.select().from(appSettings);
  } catch {
    // 表尚未迁移 / 数据库不可用：退回默认值
    return structuredClone(DEFAULT_SETTINGS);
  }
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  // 把 DB 行拼装回完整结构后必须再走一遍 coerceSettings,
  // 否则修复前/绕过 server action 直接写入的脏数据 (e.g. 含 `</style>` 的 brandColor)
  // 会原样回流到 layout 与公开页。defense-in-depth: 读侧也强制 normalize。
  return coerceSettings({
    site: mergeSection(DEFAULT_SETTINGS.site, byKey.get('site')),
    branding: mergeSection(DEFAULT_SETTINGS.branding, byKey.get('branding')),
    public: mergeSection(DEFAULT_SETTINGS.public, byKey.get('public')),
    tweaks: mergeSection(DEFAULT_SETTINGS.tweaks, byKey.get('tweaks')),
    probe: mergeSection(DEFAULT_SETTINGS.probe, byKey.get('probe')),
    logs: mergeSection(DEFAULT_SETTINGS.logs, byKey.get('logs')),
  });
}
