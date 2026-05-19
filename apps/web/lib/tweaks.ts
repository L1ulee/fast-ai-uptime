/**
 * Tweaks 面板共享常量与服务端读取工具。
 *
 * 设计：
 *  - density / saturation 由客户端 Tweaks 面板写入 <html data-density|data-saturation>
 *    （CSS 立即响应，无需 server round-trip）
 *  - heatmapDays / heroVariant 受 buildStatusResponse 数据无关；服务端读 cookie
 *    后传给 page.tsx，使其参与 SSR 与 ISR
 */

export const DENSITY_VALUES = ['compact', 'standard', 'comfortable'] as const;
export type Density = (typeof DENSITY_VALUES)[number];

export const SATURATION_VALUES = ['rich', 'muted'] as const;
export type Saturation = (typeof SATURATION_VALUES)[number];

export const HEATMAP_DAY_VALUES = [30, 60, 90] as const;
export type HeatmapDays = (typeof HEATMAP_DAY_VALUES)[number];

export const HERO_VARIANT_VALUES = ['panel', 'minimal', 'split'] as const;
export type HeroVariant = (typeof HERO_VARIANT_VALUES)[number];

export interface Tweaks {
  density: Density;
  saturation: Saturation;
  heatmapDays: HeatmapDays;
  heroVariant: HeroVariant;
}

export const DEFAULT_TWEAKS: Tweaks = {
  density: 'standard',
  saturation: 'rich',
  heatmapDays: 90,
  heroVariant: 'minimal',
};

export const TWEAK_COOKIE = {
  density: 'fau_density',
  saturation: 'fau_saturation',
  heatmapDays: 'fau_heatmap_days',
  heroVariant: 'fau_hero',
  /** 1 年 */
  maxAge: 60 * 60 * 24 * 365,
} as const;

function pickEnum<T extends readonly string[]>(
  values: T,
  raw: string | undefined,
): T[number] | null {
  if (!raw) return null;
  return (values as readonly string[]).includes(raw) ? (raw as T[number]) : null;
}

/**
 * 读取访客 cookie 的 Tweaks 选项。
 *
 * @param get   cookie getter (server: `(name) => jar.get(name)?.value`)
 * @param opts.defaults  Admin 配置的"无 cookie 时的默认值"。未传则用内置 DEFAULT_TWEAKS。
 * @param opts.allowOverride  Admin 是否允许访客覆盖。false 时忽略 cookie,直接返回 defaults。
 */
export function readTweaksFromCookies(
  get: (name: string) => string | undefined,
  opts: { defaults?: Tweaks; allowOverride?: boolean } = {},
): Tweaks {
  const d = opts.defaults ?? DEFAULT_TWEAKS;
  if (opts.allowOverride === false) return { ...d };
  const density = pickEnum(DENSITY_VALUES, get(TWEAK_COOKIE.density)) ?? d.density;
  const saturation = pickEnum(SATURATION_VALUES, get(TWEAK_COOKIE.saturation)) ?? d.saturation;
  const daysRaw = Number.parseInt(get(TWEAK_COOKIE.heatmapDays) ?? '', 10);
  const heatmapDays = (
    (HEATMAP_DAY_VALUES as readonly number[]).includes(daysRaw) ? daysRaw : d.heatmapDays
  ) as HeatmapDays;
  const heroVariant = pickEnum(HERO_VARIANT_VALUES, get(TWEAK_COOKIE.heroVariant)) ?? d.heroVariant;
  return { density, saturation, heatmapDays, heroVariant };
}
