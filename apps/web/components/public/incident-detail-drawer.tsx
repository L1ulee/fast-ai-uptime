'use client';

import { useEffect, useRef } from 'react';
import { Markdown } from '@/components/ui/markdown';
import { durationText, fmtLocal, fmtUTC, statusZh, timeAgo } from './format';
import { useSiteTimezone } from './incident-drawer-provider';
import { Pill, StatusDot } from './pill';
import type { IncidentLike } from './incident-card';

interface Props {
  incident: IncidentLike | null;
  type?: 'active' | 'maintenance';
  referenceNow?: string;
  onClose: () => void;
}

function dotColorVar(s: string): string {
  if (s === 'resolved' || s === 'completed') return 'var(--st-op)';
  if (s === 'monitoring') return 'var(--st-mon)';
  if (s === 'identified') return 'var(--st-part)';
  if (s === 'in_progress' || s === 'scheduled') return 'var(--st-maint)';
  if (s === 'cancelled') return 'var(--fg-subtle)';
  return 'var(--st-major)';
}

export function IncidentDetailDrawer({ incident, type = 'active', referenceNow, onClose }: Props) {
  const tz = useSiteTimezone();
  const open = !!incident;
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 锁滚动 + 初始焦点 + 关闭后焦点回归
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // 让关闭按钮接收初始焦点
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  const isMaint = type === 'maintenance';
  const isResolved = incident?.status === 'resolved';
  const impactLabel = incident?.impact
    ? incident.impact === 'critical'
      ? '严重'
      : incident.impact === 'major'
        ? '重大'
        : incident.impact === 'minor'
          ? '轻微'
          : '维护'
    : null;

  return (
    <>
      <div
        className={`sheet-overlay ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <div
        className={`sheet ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal={open ? 'true' : undefined}
        aria-hidden={!open}
      >
        {incident && (
          <>
            <div className="sheet-header">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  className="subtle"
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  {isMaint ? 'Maintenance' : 'Incident'} · #{incident.id}
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4, lineHeight: 1.3 }}>
                  {incident.title}
                </div>
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={onClose}
                aria-label="关闭详情"
                style={{ flexShrink: 0 }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="sheet-body">
              <div className="fade-in">
                {/* Meta */}
                <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                  <Pill status={incident.status as Parameters<typeof Pill>[0]['status']}>
                    {statusZh(incident.status)}
                  </Pill>
                  {!isMaint && impactLabel && (
                    <span className="badge" style={{ fontSize: 11 }}>
                      影响：{impactLabel}
                    </span>
                  )}
                  {isResolved && incident.resolvedAt && incident.startedAt && (
                    <span className="badge" style={{ fontSize: 11 }}>
                      持续 {durationText(incident.startedAt, incident.resolvedAt)}
                    </span>
                  )}
                </div>

                {/* Times */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 14,
                    marginBottom: 22,
                    padding: '14px 16px',
                    background: 'var(--bg-subtle)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {isMaint ? (
                    <>
                      <div>
                        <div
                          className="subtle"
                          style={{
                            fontSize: 10.5,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: 4,
                          }}
                        >
                          计划开始
                        </div>
                        <div className="tabular" style={{ fontSize: 13 }}>
                          {fmtLocal(incident.scheduledStart!, tz)}
                        </div>
                      </div>
                      <div>
                        <div
                          className="subtle"
                          style={{
                            fontSize: 10.5,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: 4,
                          }}
                        >
                          计划结束
                        </div>
                        <div className="tabular" style={{ fontSize: 13 }}>
                          {fmtLocal(incident.scheduledEnd!, tz)}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <div
                          className="subtle"
                          style={{
                            fontSize: 10.5,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: 4,
                          }}
                        >
                          开始时间
                        </div>
                        <div className="tabular" style={{ fontSize: 13 }}>
                          {fmtUTC(incident.startedAt!, tz)}
                        </div>
                        <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>
                          {timeAgo(incident.startedAt!, referenceNow)}
                        </div>
                      </div>
                      <div>
                        <div
                          className="subtle"
                          style={{
                            fontSize: 10.5,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: 4,
                          }}
                        >
                          {isResolved ? '解决时间' : '当前状态'}
                        </div>
                        <div className="tabular" style={{ fontSize: 13 }}>
                          {isResolved && incident.resolvedAt
                            ? fmtUTC(incident.resolvedAt, tz)
                            : statusZh(incident.status)}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Affected components */}
                {incident.affectedComponents && incident.affectedComponents.length > 0 && (
                  <div style={{ marginBottom: 22 }}>
                    <div className="section-h" style={{ fontSize: 11, marginBottom: 10 }}>
                      受影响组件 · Affected
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {incident.affectedComponents.map((c) => (
                        <div
                          key={c.id}
                          className="row"
                          style={{
                            gap: 10,
                            padding: '10px 12px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 'calc(var(--radius) - 2px)',
                          }}
                        >
                          <StatusDot status={c.status ?? 'partial_outage'} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Body */}
                {incident.bodyMd && (
                  <div style={{ marginBottom: 22 }}>
                    <div className="section-h" style={{ fontSize: 11, marginBottom: 10 }}>
                      简述 · Summary
                    </div>
                    <div
                      style={{
                        fontSize: 13.5,
                        color: 'var(--fg-muted)',
                        lineHeight: 1.65,
                      }}
                    >
                      <Markdown source={incident.bodyMd} />
                    </div>
                  </div>
                )}

                {/* Timeline */}
                {incident.updates && incident.updates.length > 0 && (
                  <div>
                    <div className="section-h" style={{ fontSize: 11, marginBottom: 14 }}>
                      时间线 · Timeline ({incident.updates.length})
                    </div>
                    <div style={{ position: 'relative', paddingLeft: 22 }}>
                      <div
                        style={{
                          position: 'absolute',
                          left: 6,
                          top: 6,
                          bottom: 6,
                          width: 1,
                          background: 'var(--border)',
                        }}
                      />
                      {incident.updates.map((u, i, arr) => (
                        <div
                          key={i}
                          style={{
                            position: 'relative',
                            paddingBottom: i < arr.length - 1 ? 18 : 0,
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              left: -22,
                              top: 4,
                              width: 13,
                              height: 13,
                              borderRadius: 999,
                              background: dotColorVar(u.status),
                              boxShadow: `0 0 0 3px var(--bg-elevated)`,
                              border: '1px solid var(--border)',
                            }}
                            aria-hidden
                          />
                          <div
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              color: 'var(--fg-subtle)',
                              marginBottom: 4,
                            }}
                          >
                            {statusZh(u.status)}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.55 }}>
                            <Markdown source={u.body} />
                          </div>
                          {u.affected && u.affected.length > 0 && (
                            <div className="subtle" style={{ fontSize: 11.5, marginTop: 4 }}>
                              影响：{u.affected.map((a) => a.name).join('、')}
                            </div>
                          )}
                          <div className="subtle tabular" style={{ fontSize: 11, marginTop: 4 }}>
                            {fmtUTC(u.at, tz)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="sheet-footer">
              <span
                className="subtle"
                style={{ fontSize: 11, marginRight: 'auto', alignSelf: 'center' }}
              >
                按 Esc 关闭
              </span>
              <button type="button" className="btn" onClick={onClose}>
                关闭
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
