/**
 * 90 天可用率热力条 — Apple Dock 风格放大 + 悬浮 tooltip。
 * Tooltip 内容遵循新设计：日期 + 可用率 + 当日事件列表。
 */
import { useMemo } from 'react';
import type { DailyStat, IncidentDto, MaintenanceDto } from '@/lib/api/types';

function uptimeColor(v: number | null): string {
  if (v == null) return 'var(--st-unknown-bg)';
  if (v >= 99) return 'var(--st-op)';
  if (v >= 95) return 'var(--st-deg)';
  if (v >= 90) return 'var(--st-part)';
  return 'var(--st-major)';
}

function uptimeOpacity(v: number | null): number {
  if (v == null) return 0.3;
  if (v >= 99.9) return 1;
  if (v >= 99) return 0.78;
  return 1;
}

/** 把事件状态映射为对应的 status-dot 色 token（与设计的 eventDotKey 等价）。 */
function eventDotKey(status: string): 'op' | 'maint' | 'mon' | 'part' | 'major' {
  switch (status) {
    case 'resolved':
    case 'completed':
      return 'op';
    case 'monitoring':
      return 'mon';
    case 'identified':
      return 'part';
    case 'investigating':
      return 'major';
    case 'in_progress':
    case 'scheduled':
      return 'maint';
    default:
      return 'part';
  }
}

export type HeatmapEvent =
  | (Pick<IncidentDto, 'id' | 'title' | 'status' | 'affectedComponents' | 'startedAt'> & {
      kind: 'incident';
    })
  | (Pick<MaintenanceDto, 'id' | 'title' | 'status' | 'affectedComponents' | 'scheduledStart'> & {
      kind: 'maintenance';
    });

interface Props {
  /** 90 天日级数据，按时间升序 */
  daily: DailyStat[];
  /** 显示天数（30/60/90），从最近一段切片 */
  totalDays?: number;
  /** 当前组件 id，用于过滤 events 中的 affectedComponents */
  componentId?: number;
  /** 全部相关事件（活动/历史 incidents + 维护），未传则不展示事件区 */
  events?: HeatmapEvent[];
}

export function UptimeHeatmap({ daily, totalDays = 90, componentId, events }: Props) {
  const slice = daily.slice(-totalDays);
  const known = slice.filter((d) => d.uptime != null);
  const avg =
    known.length > 0
      ? (known.reduce((s, d) => s + (d.uptime ?? 0), 0) / known.length).toFixed(2)
      : '—';

  const eventsByDay = useMemo(() => {
    const m = new Map<string, HeatmapEvent[]>();
    if (!events || componentId == null) return m;
    for (const e of events) {
      const hits = (e.affectedComponents ?? []).some((c) => c.id === componentId);
      if (!hits) continue;
      const start = e.kind === 'incident' ? e.startedAt : e.scheduledStart;
      const day = (start ?? '').slice(0, 10);
      if (!day) continue;
      const arr = m.get(day) ?? [];
      arr.push(e);
      m.set(day, arr);
    }
    return m;
  }, [events, componentId]);

  return (
    <div className="row" style={{ gap: 10 }}>
      <span className="tabular" style={{ fontSize: 10.5, color: 'var(--fg-subtle)', minWidth: 36 }}>
        {totalDays}d ago
      </span>
      <div className="uptime-bar" style={{ flex: 1 }} role="list" aria-label="每日可用率">
        {slice.map((d, i) => {
          const dayEvents = eventsByDay.get(d.date) ?? [];
          return (
            <div
              key={`${d.date}-${i}`}
              className="tip-wrap uptime-cell"
              role="listitem"
              aria-label={d.uptime != null ? `${d.date}: ${d.uptime}% 可用率` : `${d.date}: 无数据`}
              style={{ background: uptimeColor(d.uptime), opacity: uptimeOpacity(d.uptime) }}
            >
              <div className="tip">
                <div className="tip-head">{d.date}</div>
                <div className="tip-grid">
                  <span className="tip-key">可用率</span>
                  <span className="tabular">{d.uptime != null ? `${d.uptime}%` : '—'}</span>
                </div>
                <div className="tip-events">
                  {dayEvents.length === 0 ? (
                    <span className="tip-event-none">当日无事件</span>
                  ) : (
                    dayEvents.map((ev) => (
                      <div key={`${ev.kind}-${ev.id}`} className="tip-event">
                        <span
                          className="tip-event-dot"
                          style={{ background: `var(--st-${eventDotKey(ev.status)})` }}
                        />
                        <span>{ev.title}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <span style={{ fontSize: 10.5, color: 'var(--fg-subtle)', minWidth: 80, textAlign: 'right' }}>
        Today ·{' '}
        <span className="tabular" style={{ color: 'var(--fg)', fontWeight: 600 }}>
          {avg === '—' ? '—' : `${avg}%`}
        </span>
      </span>
    </div>
  );
}
