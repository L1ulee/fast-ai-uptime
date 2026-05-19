/**
 * 公开页状态 Pill / Dot — 与设计的 .pill / .dot 类绑定。
 */
import type { ReactNode } from 'react';
import type { ComponentStatus, IncidentStatus } from '@/lib/api/types';

export type PillStatusKey =
  | ComponentStatus
  | IncidentStatus
  | 'in_progress'
  | 'scheduled'
  | 'completed'
  | 'cancelled';

const STATUS_LABEL_CN: Record<PillStatusKey, string> = {
  operational: '正常',
  degraded: '降级',
  partial_outage: '部分中断',
  major_outage: '中断',
  maintenance: '维护中',
  unknown: '未知',
  investigating: '调查中',
  identified: '已定位',
  monitoring: '观察中',
  resolved: '已解决',
  in_progress: '维护中',
  scheduled: '已计划',
  completed: '已完成',
  cancelled: '已取消',
};

const STATUS_LABEL_EN: Record<PillStatusKey, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  partial_outage: 'Partial Outage',
  major_outage: 'Major Outage',
  maintenance: 'Maintenance',
  unknown: 'Unknown',
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  in_progress: 'In progress',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

interface PillProps {
  status: PillStatusKey;
  children?: ReactNode;
  /** 显示英文标签 */
  en?: boolean;
}

export function Pill({ status, children, en }: PillProps) {
  return (
    <span className={`pill pill-${status}`}>
      <span className={`dot dot-${status}`} aria-hidden />
      {children ?? (en ? STATUS_LABEL_EN[status] : STATUS_LABEL_CN[status])}
    </span>
  );
}

interface StatusDotProps {
  status: PillStatusKey;
  /** 是否使用强一点的脉冲（适用于"非正常"状态） */
  pulse?: boolean;
  size?: number;
}

export function StatusDot({ status, pulse, size }: StatusDotProps) {
  const cls = `dot dot-${status} ${pulse && status !== 'operational' ? 'dot-pulse' : ''}`.trim();
  if (size) {
    return <span className={cls} style={{ width: size, height: size }} aria-hidden />;
  }
  return <span className={cls} aria-hidden />;
}

export { STATUS_LABEL_CN, STATUS_LABEL_EN };
