// Client-safe constants and types for official status. No DB / server-only imports.

export type OfficialOverallStatus =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage'
  | 'maintenance'
  | 'unknown';

export type FeedKind = 'statuspage_v2' | 'rss' | 'atom';

/** zh 默认标签;en 见 OFFICIAL_STATUS_LABEL_EN。officialStatusLabel(s, lang) 统一入口。 */
export const OFFICIAL_STATUS_LABEL: Record<OfficialOverallStatus, string> = {
  operational: '正常',
  degraded: '降级',
  partial_outage: '部分中断',
  major_outage: '重大中断',
  maintenance: '维护中',
  unknown: '未知',
};

export const OFFICIAL_STATUS_LABEL_EN: Record<OfficialOverallStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
  maintenance: 'Maintenance',
  unknown: 'Unknown',
};

export function officialStatusLabel(s: OfficialOverallStatus, lang: 'zh' | 'en' = 'zh'): string {
  return (lang === 'en' ? OFFICIAL_STATUS_LABEL_EN : OFFICIAL_STATUS_LABEL)[s];
}

export const OFFICIAL_STATUS_COLOR: Record<OfficialOverallStatus, string> = {
  operational: 'var(--st-op)',
  degraded: 'var(--st-deg)',
  partial_outage: 'var(--st-part)',
  major_outage: 'var(--st-major)',
  maintenance: 'var(--st-maint)',
  unknown: 'var(--fg-muted)',
};
