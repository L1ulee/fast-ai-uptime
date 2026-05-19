'use client';

import { useState } from 'react';
import type { ComponentStatus, GroupDto } from '@/lib/api/types';
import { Pill, StatusDot } from './pill';
import { UptimeHeatmap, type HeatmapEvent } from './uptime-heatmap';

function formatInterval(sec: number): string {
  if (!sec || sec <= 0) return '';
  if (sec < 60) return `每 ${sec} 秒`;
  if (sec % 60 === 0 && sec < 3600) return `每 ${sec / 60} 分钟`;
  return `每 ${Math.round(sec / 60)} 分钟`;
}

interface Props {
  group: GroupDto;
  heatmapDays?: number;
  defaultOpen?: boolean;
  /** 相关事件（incidents + maintenances），用于在 heatmap tooltip 中显示当日事件 */
  events?: HeatmapEvent[];
}

const ORDER: ComponentStatus[] = [
  'major_outage',
  'partial_outage',
  'degraded',
  'maintenance',
  'unknown',
  'operational',
];

function worstStatus(group: GroupDto): ComponentStatus {
  return ORDER.find((s) => group.components.some((c) => c.status === s)) ?? 'operational';
}

export function GroupCard({ group, heatmapDays = 90, defaultOpen = true, events }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const groupStatus = worstStatus(group);

  // overflow:visible 让首行 heatmap cell 的 .tip 能向上突破 card 边界。
  // card class 自带 border-radius;内部子元素未刻意贴边,无需 clip。
  return (
    <div className="card" style={{ overflow: 'visible' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          gap: 12,
          boxSizing: 'border-box',
        }}
      >
        <div className="row" style={{ gap: 10, minWidth: 0, flex: 1 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{
              color: 'var(--fg-subtle)',
              transform: open ? 'rotate(90deg)' : 'rotate(0)',
              transition: 'transform 160ms',
              flexShrink: 0,
            }}
            aria-hidden
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{group.displayName}</div>
            {group.description && (
              <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)', marginTop: 2 }}>
                {group.description}
              </div>
            )}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <Pill status={groupStatus} />
        </div>
      </button>
      {open && (
        <div className="fade-in">
          {group.components.map((c, i) => (
            <div
              key={c.id}
              style={{
                padding: 'var(--row-py) 18px',
                borderBottom: i < group.components.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                  <StatusDot status={c.status} pulse />
                  <span style={{ fontWeight: 500, fontSize: 13.5 }}>{c.name}</span>
                </div>
                <div className="row" style={{ gap: 12 }}>
                  <span className="tabular subtle" style={{ fontSize: 12 }}>
                    {c.latencyMs != null ? `${c.latencyMs} ms` : '—'}
                  </span>
                  {c.intervalSec != null && (
                    <span
                      className="subtle"
                      style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                      title={`探测间隔 ${c.intervalSec} 秒`}
                    >
                      {formatInterval(c.intervalSec)}
                    </span>
                  )}
                  <Pill status={c.status} />
                </div>
              </div>
              <UptimeHeatmap
                daily={c.daily90d}
                totalDays={heatmapDays}
                componentId={c.id}
                events={events}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
