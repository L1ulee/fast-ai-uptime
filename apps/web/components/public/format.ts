/**
 * Public-page 时间 / 时长格式化。
 *
 * 时区策略:所有显示均以 admin "站点时区"(site.timezone)为准 —— SSR 与 CSR 输出
 * 完全一致(Intl 显式指定 timeZone),消除时区漂移与 hydration 警告。
 *
 * 历史名 fmtUTC / fmtLocal 保留为兼容别名,新增 tz 参数;调用方
 * 应该传站点时区。缺省回退到 UTC(用于上下文丢失的极端情况)。
 */

import { fmtRangeTz, fmtTz, fmtTzWithLabel } from '@/lib/timezone';

/** 事件 / 维护状态的中文标签。统一来源,避免组件之间漂移。 */
const STATUS_ZH: Record<string, string> = {
  investigating: '调查中',
  identified: '已定位',
  monitoring: '观察中',
  resolved: '已解决',
  scheduled: '已计划',
  in_progress: '维护中',
  completed: '已完成',
  cancelled: '已取消',
};

export function statusZh(s: string): string {
  return STATUS_ZH[s] ?? s;
}

/** 完整带时区标签的时间(显示在最末端,有 hover 价值)。 */
export function fmtUTC(iso: string | Date, tz: string = 'UTC'): string {
  return fmtTzWithLabel(iso, tz);
}

/** 维护窗口范围(同日合并日期)。 */
export function fmtRange(a: string, b: string, tz: string = 'UTC'): string {
  return fmtRangeTz(a, b, tz);
}

/** 计划维护类时间(与录入侧时区一致,无 UTC 后缀)。 */
export function fmtLocal(iso: string | Date, tz: string = 'UTC'): string {
  return fmtTz(iso, tz, 'datetime');
}

export function durationText(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return '<1 分钟';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} 分钟`;
  const hrs = Math.floor(mins / 60);
  const rm = mins % 60;
  if (hrs < 24) return `${hrs} 小时${rm ? ` ${rm} 分` : ''}`;
  const days = Math.floor(hrs / 24);
  return `${days} 天 ${hrs % 24} 小时`;
}

/**
 * 相对当前时刻的"几分钟前 / 几小时前 / 几天前"。
 * referenceNow 用于服务端渲染时把"now"固定到 buildStatusResponse 的时刻,
 * 避免 SSR / CSR 漂移。
 */
export function timeAgo(iso: string, referenceNow?: string): string {
  const now = referenceNow ? new Date(referenceNow).getTime() : Date.now();
  const diff = now - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}
