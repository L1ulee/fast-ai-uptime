/**
 * 站点时区(IANA tz name)感知的时间格式化与解析工具。
 *
 * 设计:
 *  - 显示侧:全部走 Intl.DateTimeFormat({ timeZone: tz }),server 与 client 输出
 *    完全一致,无 SSR/CSR 漂移。
 *  - 输入侧:管理员录入 datetime-local 时,以站点时区"墙上时间"解释,转 UTC ISO 存。
 *  - 默认 tz 为 'UTC',保证调用方忘记传 tz 也不会崩,只是退化为 UTC 显示。
 */

const TIME_STYLES = {
  datetime: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  },
  short: {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  },
  date: { year: 'numeric', month: '2-digit', day: '2-digit' },
  time: { hour: '2-digit', minute: '2-digit', hour12: false },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type TimeStyle = keyof typeof TIME_STYLES;

function safeDate(iso: string | Date | null | undefined): Date | null {
  if (iso == null) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 主格式化函数:把 ISO / Date 在指定 IANA tz 中格式化为字符串。
 *
 * 默认所有 datetime / short / time 风格都附时区简短标签 (UTC+HH:MM),
 * 以匹配 admin "系统设置 → 时区";仅纯日期 (date) 风格不带标签。
 * 内部需要"裸时间"调用方可传 withLabel: false。
 */
export function fmtTz(
  iso: string | Date | null,
  tz: string,
  style: TimeStyle = 'datetime',
  opts: { withLabel?: boolean } = {},
): string {
  const d = safeDate(iso);
  if (!d) return '';
  const intlOpts: Intl.DateTimeFormatOptions = {
    ...TIME_STYLES[style],
    timeZone: tz || 'UTC',
  };
  // zh-CN 输出 "YYYY/MM/DD HH:MM";改成连字符更易读且与历史 fmtUTC 风格一致。
  const body = new Intl.DateTimeFormat('zh-CN', intlOpts).format(d).replace(/\//g, '-');
  const withLabel = opts.withLabel ?? style !== 'date';
  return withLabel ? `${body} ${shortTzLabel(tz)}` : body;
}

/** 等价于 fmtTz(iso, tz, 'datetime'),保留以减少调用方改动。 */
export function fmtTzWithLabel(iso: string | Date | null, tz: string): string {
  return fmtTz(iso, tz, 'datetime');
}

/** 范围 "MM-DD HH:MM → MM-DD HH:MM TZLABEL";同一天时合并 day。 */
export function fmtRangeTz(a: string | Date | null, b: string | Date | null, tz: string): string {
  const da = safeDate(a);
  const db = safeDate(b);
  if (!da || !db) return '';
  const parts = (d: Date) => splitParts(d, tz);
  const pa = parts(da);
  const pb = parts(db);
  const sameDay = pa.y === pb.y && pa.m === pb.m && pa.d === pb.d;
  const hm = (p: ReturnType<typeof splitParts>) => `${p.hh}:${p.mm}`;
  const label = shortTzLabel(tz);
  if (sameDay) return `${pa.y}-${pa.m}-${pa.d} ${hm(pa)} → ${hm(pb)} ${label}`;
  return `${pa.m}-${pa.d} ${hm(pa)} → ${pb.m}-${pb.d} ${hm(pb)} ${label}`;
}

/**
 * 当前时刻在 tz 内的短名 (HKT / CST / EST / GMT 等)。
 *
 * Node 的 Intl 对北美/欧洲部分时区返回字母缩写 (EDT / BST),但亚洲 / 中东 / 大洋洲
 * 多数时区返回的是 "GMT+8" 这种 offset 形式。针对常见 IANA tz 维护一份手工映射,
 * 命中则返回 "HKT" / "CST" 等;不命中再退回 "UTC±HH:MM" 规范化输出。
 */
const IANA_ABBR: Readonly<Record<string, string>> = {
  // East Asia
  'Asia/Shanghai': 'CST',
  'Asia/Chongqing': 'CST',
  'Asia/Urumqi': 'XJT',
  'Asia/Hong_Kong': 'HKT',
  'Asia/Macau': 'CST',
  'Asia/Taipei': 'CST',
  'Asia/Tokyo': 'JST',
  'Asia/Seoul': 'KST',
  'Asia/Pyongyang': 'KST',
  'Asia/Ulaanbaatar': 'ULAT',
  // SE Asia / South Asia / Middle East
  'Asia/Singapore': 'SGT',
  'Asia/Kuala_Lumpur': 'MYT',
  'Asia/Bangkok': 'ICT',
  'Asia/Ho_Chi_Minh': 'ICT',
  'Asia/Jakarta': 'WIB',
  'Asia/Manila': 'PST',
  'Asia/Kolkata': 'IST',
  'Asia/Karachi': 'PKT',
  'Asia/Dhaka': 'BST',
  'Asia/Yangon': 'MMT',
  'Asia/Dubai': 'GST',
  'Asia/Tehran': 'IRST',
  'Asia/Jerusalem': 'IST',
  // Oceania
  'Australia/Sydney': 'AET',
  'Australia/Melbourne': 'AET',
  'Australia/Brisbane': 'AEST',
  'Australia/Perth': 'AWST',
  'Pacific/Auckland': 'NZT',
  'Pacific/Honolulu': 'HST',
  // Europe / Africa
  'Europe/Moscow': 'MSK',
  'Europe/Istanbul': 'TRT',
  'Africa/Cairo': 'EET',
  'Africa/Johannesburg': 'SAST',
  'Africa/Nairobi': 'EAT',
  // Americas
  'America/Sao_Paulo': 'BRT',
  'America/Argentina/Buenos_Aires': 'ART',
  'America/Mexico_City': 'CST',
  'America/Bogota': 'COT',
  'America/Lima': 'PET',
  'America/Caracas': 'VET',
  'America/Santiago': 'CLT',
};

export function shortTzLabel(tz: string): string {
  const zone = tz || 'UTC';
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'short',
      year: 'numeric',
    });
    const parts = dtf.formatToParts(new Date());
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'UTC';
    // Intl 命中字母缩写 (EDT / BST / GMT / UTC 等) 直接返回。
    if (/^[A-Z]{2,5}$/.test(name)) return name;
    // Intl 退化成 "GMT+8" 之类:查手工表;查得到返回缩写,否则规范化 UTC±HH:MM。
    if (IANA_ABBR[zone]) return IANA_ABBR[zone];
    const m = name.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/i);
    if (!m) return 'UTC';
    const sign = m[1] ?? '+';
    const hh = String(Number(m[2] ?? 0)).padStart(2, '0');
    const mm = String(Number(m[3] ?? 0)).padStart(2, '0');
    return `UTC${sign}${hh}:${mm}`;
  } catch {
    return 'UTC';
  }
}

interface DateParts {
  y: string;
  m: string;
  d: string;
  hh: string;
  mm: string;
}

function splitParts(d: Date, tz: string): DateParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '00';
  let hh = get('hour');
  // Chromium 对 hour12:false 会把 "24" 输出 (代表 00 of next day)。归一化。
  if (hh === '24') hh = '00';
  return {
    y: get('year'),
    m: get('month'),
    d: get('day'),
    hh,
    mm: get('minute'),
  };
}

/**
 * 把 datetime-local 字符串("YYYY-MM-DDTHH:MM" 或带秒) 按 tz 解释为 UTC ISO。
 *
 * 例:tz=Asia/Shanghai, s="2026-05-17T14:00" -> "2026-05-17T06:00:00.000Z"
 */
export function localStrInTzToIso(s: string, tz: string): string {
  if (!s) return '';
  const date = parseLocalString(s);
  if (!date) return '';
  return wallTimeInTzToUtc(date, tz).toISOString();
}

/**
 * 反向:把 UTC ISO 转成 tz 内的 datetime-local 字符串("YYYY-MM-DDTHH:MM")。
 */
export function isoToLocalStrInTz(iso: string | Date | null, tz: string): string {
  const d = safeDate(iso);
  if (!d) return '';
  const p = splitParts(d, tz);
  return `${p.y}-${p.m}-${p.d}T${p.hh}:${p.mm}`;
}

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function parseLocalString(s: string): WallTime | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

/**
 * 给定 tz 内"墙上时间",求对应的 UTC 时间戳。两轮收敛足以处理 DST。
 */
function wallTimeInTzToUtc(wt: WallTime, tz: string): Date {
  const wantedMs = Date.UTC(wt.year, wt.month - 1, wt.day, wt.hour, wt.minute);
  // 第一次猜测:把墙上时间当 UTC
  let guessMs = wantedMs;
  for (let i = 0; i < 2; i += 1) {
    const seen = splitParts(new Date(guessMs), tz);
    const seenMs = Date.UTC(
      Number(seen.y),
      Number(seen.m) - 1,
      Number(seen.d),
      Number(seen.hh),
      Number(seen.mm),
    );
    const delta = wantedMs - seenMs;
    if (delta === 0) break;
    guessMs += delta;
  }
  return new Date(guessMs);
}
