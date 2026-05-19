'use client';

import type { IncidentDto, MaintenanceDto } from '@/lib/api/types';
import { Markdown } from '@/components/ui/markdown';
import { durationText, fmtRange, fmtUTC, statusZh, timeAgo } from './format';
import { useIncidentDrawer, useSiteTimezone } from './incident-drawer-provider';
import { Pill, type PillStatusKey } from './pill';

export type IncidentLike = (IncidentDto | MaintenanceDto) & {
  startedAt?: string;
  resolvedAt?: string | null;
  scheduledStart?: string;
  scheduledEnd?: string;
  bodyMd?: string | null;
  status: string;
  impact?: string;
  updates?: Array<{
    status: string;
    at: string;
    body: string;
    affected?: Array<{ id: number; name: string }>;
  }>;
};

interface Props {
  incident: IncidentLike;
  type?: 'active' | 'maintenance';
  /** 用于 timeAgo 的服务端 now，避免 SSR/CSR 漂移 */
  referenceNow?: string;
  onClick?: (incident: IncidentLike, type?: 'active' | 'maintenance') => void;
}

function statusKey(incident: IncidentLike, type?: 'active' | 'maintenance'): PillStatusKey {
  if (type === 'maintenance') {
    if (incident.status === 'in_progress') return 'in_progress';
    if (incident.status === 'completed') return 'completed';
    if (incident.status === 'cancelled') return 'cancelled';
    return 'scheduled';
  }
  if (incident.status === 'resolved') return 'resolved';
  if (incident.status === 'monitoring') return 'monitoring';
  if (incident.status === 'identified') return 'identified';
  return 'investigating';
}

function statusColorVar(key: PillStatusKey): string {
  switch (key) {
    case 'resolved':
    case 'completed':
      return 'var(--st-op)';
    case 'monitoring':
      return 'var(--st-mon)';
    case 'identified':
      return 'var(--st-part)';
    case 'investigating':
    case 'major_outage':
      return 'var(--st-major)';
    case 'in_progress':
    case 'scheduled':
    case 'maintenance':
      return 'var(--st-maint)';
    case 'partial_outage':
      return 'var(--st-part)';
    case 'degraded':
      return 'var(--st-deg)';
    case 'cancelled':
      return 'var(--fg-subtle)';
    default:
      return 'var(--border-strong)';
  }
}

/** 影响等级 → 标签 + 颜色（与状态色 token 对齐）。 */
interface ImpactMeta {
  label: string;
  color: string;
  bg: string;
}
const IMPACT_META: Record<string, ImpactMeta> = {
  none: { label: '无影响', color: 'var(--st-op)', bg: 'var(--st-op-bg)' },
  minor: { label: '轻微', color: 'var(--st-deg)', bg: 'var(--st-deg-bg)' },
  major: { label: '重大', color: 'var(--st-part)', bg: 'var(--st-part-bg)' },
  critical: { label: '严重', color: 'var(--st-major)', bg: 'var(--st-major-bg)' },
};
const IMPACT_FALLBACK: ImpactMeta = {
  label: '影响未知',
  color: 'var(--fg-subtle)',
  bg: 'var(--bg-subtle)',
};

/** 影响等级胶囊 —— 复用 .pill 样式，颜色按影响等级着色。 */
function ImpactPill({ impact }: { impact: string }) {
  const m = IMPACT_META[impact] ?? IMPACT_FALLBACK;
  return (
    <span className="pill" style={{ background: m.bg, color: m.color }}>
      <span className="dot" style={{ background: m.color }} aria-hidden />
      {m.label}
    </span>
  );
}

export function IncidentCard({ incident, type = 'active', referenceNow, onClick }: Props) {
  const key = statusKey(incident, type);
  const borderColor = statusColorVar(key);
  const drawerOpen = useIncidentDrawer();
  const tz = useSiteTimezone();
  const handleClick: (() => void) | undefined = onClick
    ? () => onClick(incident, type)
    : drawerOpen
      ? () => drawerOpen(incident, type)
      : undefined;
  const clickable = !!handleClick;
  const isResolved = incident.status === 'resolved';

  return (
    <div
      className="card lift"
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? handleClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick!();
              }
            }
          : undefined
      }
      style={{
        borderLeft: `3px solid ${borderColor}`,
        padding: 'var(--card-p)',
        cursor: clickable ? 'pointer' : 'default',
        position: 'relative',
      }}
    >
      {clickable && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            position: 'absolute',
            top: 16,
            right: 14,
            color: 'var(--fg-subtle)',
            opacity: 0.5,
          }}
          aria-hidden
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}

      <div
        className="row"
        style={{ gap: 10, marginBottom: 8, flexWrap: 'wrap', paddingRight: clickable ? 24 : 0 }}
      >
        <Pill status={key}>{statusZh(incident.status)}</Pill>
        {type !== 'maintenance' && incident.impact && <ImpactPill impact={incident.impact} />}
        <span style={{ fontWeight: 600, fontSize: 14 }}>{incident.title}</span>
        {isResolved && incident.resolvedAt && incident.startedAt && (
          <span className="subtle" style={{ fontSize: 11.5 }}>
            · 持续 {durationText(incident.startedAt, incident.resolvedAt)}
          </span>
        )}
      </div>

      {incident.affectedComponents && incident.affectedComponents.length > 0 && (
        <div className="subtle" style={{ fontSize: 12, marginBottom: 4 }}>
          影响：{incident.affectedComponents.map((c) => c.name).join('、')}
        </div>
      )}

      {incident.scheduledStart ? (
        <div className="subtle" style={{ fontSize: 12 }}>
          {fmtRange(incident.scheduledStart, incident.scheduledEnd!, tz)}
        </div>
      ) : (
        incident.startedAt && (
          <div className="subtle" style={{ fontSize: 12 }}>
            开始于 {fmtUTC(incident.startedAt, tz)} · {timeAgo(incident.startedAt, referenceNow)}
          </div>
        )
      )}

      {incident.bodyMd && (
        <div style={{ fontSize: 13, marginTop: 8, color: 'var(--fg-muted)' }}>
          <Markdown source={incident.bodyMd} />
        </div>
      )}

      {incident.updates && incident.updates.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
          {/* 更新流以竖向 Timeline 呈现，与事件详情抽屉同款视觉 */}
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div
              style={{
                position: 'absolute',
                left: 5,
                top: 5,
                bottom: 5,
                width: 1,
                background: 'var(--border)',
              }}
              aria-hidden
            />
            {incident.updates.map((u, i, arr) => (
              <div
                key={i}
                style={{ position: 'relative', paddingBottom: i < arr.length - 1 ? 14 : 0 }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: -20,
                    top: 3,
                    width: 11,
                    height: 11,
                    borderRadius: 999,
                    background: statusColorVar(u.status as PillStatusKey),
                    boxShadow: '0 0 0 3px var(--bg-elevated)',
                    border: '1px solid var(--border)',
                  }}
                  aria-hidden
                />
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--fg-subtle)',
                    marginBottom: 3,
                  }}
                >
                  {statusZh(u.status)}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.55 }}>
                  <Markdown source={u.body} />
                </div>
                {u.affected && u.affected.length > 0 && (
                  <div className="subtle" style={{ fontSize: 11, marginTop: 3 }}>
                    影响：{u.affected.map((a) => a.name).join('、')}
                  </div>
                )}
                <div className="subtle tabular" style={{ fontSize: 11, marginTop: 3 }}>
                  {fmtUTC(u.at, tz)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
