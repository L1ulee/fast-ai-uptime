'use client';

import { useMemo, useState, useTransition } from 'react';
import { PageHeader } from '@/components/admin/forms';
import { Icon } from '@/components/admin/icon';
import { RefreshButton } from '@/components/admin/refresh-button';
import { StatCard } from '@/components/admin/stat-card';
import { Sheet } from '@/components/ui/sheet';
import type { LogLevel, LogSource, UnifiedLogEntry } from '@/lib/admin/logs-feed';

// 统一日志条目类型来自 lib/admin/logs-feed（同时供 /admin 概览的活动日志复用）。
export type LogEntryRow = UnifiedLogEntry;
export type { LogLevel, LogSource };

export interface LogsSummary {
  last24h: { total: number; error: number; warn: number; info: number; debug: number };
  retentionDays: number;
  diskUsedMb: number;
}

// — Static meta (single source for label, color, icon) —
const LEVEL_META: Record<LogLevel, { label: string; dot: string; bg: string; fg: string }> = {
  error: {
    label: 'Error',
    dot: 'var(--st-major)',
    bg: 'var(--st-major-bg)',
    fg: 'var(--st-major)',
  },
  warn: { label: 'Warn', dot: 'var(--st-deg)', bg: 'var(--st-deg-bg)', fg: 'var(--st-deg)' },
  info: { label: 'Info', dot: 'var(--st-maint)', bg: 'var(--st-maint-bg)', fg: 'var(--st-maint)' },
  debug: { label: 'Debug', dot: 'var(--fg-subtle)', bg: 'var(--bg-subtle)', fg: 'var(--fg-muted)' },
};

const SOURCE_META: Record<LogSource, { label: string; tone: string }> = {
  audit: { label: '审计', tone: 'violet' },
  probe: { label: '探测', tone: 'green' },
  webhook: { label: 'Webhook', tone: 'blue' },
  system: { label: '系统', tone: 'orange' },
};

function LevelChip({ level }: { level: LogLevel }) {
  const m = LEVEL_META[level] ?? LEVEL_META.info;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 7px 2px 6px',
        borderRadius: 4,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: m.bg,
        color: m.fg,
        minWidth: 50,
        justifyContent: 'center',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 999, background: m.dot, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

function SourceBadge({ source }: { source: LogSource }) {
  const m = SOURCE_META[source] ?? { label: source, tone: '' };
  return (
    <span className={`badge ${m.tone ? `badge-${m.tone}` : ''}`} style={{ fontSize: 10.5 }}>
      {m.label}
    </span>
  );
}

interface Bucket {
  day: string;
  key: string;
  total: number;
  error: number;
  warn: number;
}

// — Compact 7-day bar chart for log volume —
function VolumeBars({ buckets }: { buckets: Bucket[] }) {
  const max = Math.max(...buckets.map((b) => b.total), 1);
  return (
    <div className="row" style={{ gap: 3, height: 36, alignItems: 'flex-end' }}>
      {buckets.map((b, i) => (
        <div
          key={i}
          className="tip-wrap"
          style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            style={{
              width: '100%',
              height: `${Math.max(2, (b.total / max) * 100)}%`,
              background:
                b.error > 0 ? 'var(--st-major)' : b.warn > 0 ? 'var(--st-deg)' : 'var(--st-maint)',
              opacity: 0.85,
              borderRadius: 2,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
            }}
          />
          <div className="tip">
            <div className="tip-head">{b.day}</div>
            <div className="tip-grid">
              <span className="tip-key">合计</span>
              <span className="tabular">{b.total}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function relTime(isoStr: string, nowIso: string): string {
  const ms = new Date(nowIso).getTime() - new Date(isoStr).getTime();
  if (ms < 60_000) return '刚刚';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} 分钟前`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} 小时前`;
  return `${Math.floor(ms / 86_400_000)} 天前`;
}

type LevelFilter = 'all' | LogLevel;
type SourceFilter = 'all' | LogSource;
type RangeFilter = '1h' | '24h' | '7d' | 'all';

type ClearScope = 'all' | LogSource;

export function LogsTable({
  logs,
  summary,
  now,
  clearLogs,
}: {
  logs: LogEntryRow[];
  summary: LogsSummary;
  now: string;
  clearLogs?: (formData: FormData) => Promise<void>;
}) {
  const [level, setLevel] = useState<LevelFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [range, setRange] = useState<RangeFilter>('24h');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearScope, setClearScope] = useState<ClearScope>('all');
  const [clearKeepDays, setClearKeepDays] = useState<number>(30);
  const [clearBusy, startClear] = useTransition();

  const runClear = () => {
    if (!clearLogs) return;
    const target = clearScope === 'all' ? '全部日志' : SOURCE_META[clearScope as LogSource]?.label;
    const action =
      clearKeepDays === 0
        ? `确认完全清空「${target}」?此操作不可撤销。`
        : `确认清除「${target}」中超过 ${clearKeepDays} 天的旧记录?此操作不可撤销。`;
    if (!confirm(action)) return;
    const fd = new FormData();
    fd.set('scope', clearScope);
    fd.set('keep_days', String(clearKeepDays));
    startClear(async () => {
      try {
        await clearLogs(fd);
        setClearOpen(false);
      } catch (err) {
        alert(`清除失败:${err instanceof Error ? err.message : String(err)}`);
      }
    });
  };

  const filtered = useMemo(() => {
    const nowMs = new Date(now).getTime();
    const windowMs =
      range === '1h'
        ? 3_600_000
        : range === '24h'
          ? 86_400_000
          : range === '7d'
            ? 7 * 86_400_000
            : Infinity;
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      if (level !== 'all' && l.level !== level) return false;
      if (source !== 'all' && l.source !== source) return false;
      if (windowMs !== Infinity && nowMs - new Date(l.at).getTime() > windowMs) return false;
      if (
        q &&
        !(
          l.target.toLowerCase().includes(q) ||
          l.message.toLowerCase().includes(q) ||
          l.actor.toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [logs, level, source, range, query, now]);

  const selected =
    filtered.find((l) => l.id === selectedId) ?? logs.find((l) => l.id === selectedId);

  // Build 7-day volume buckets
  const buckets = useMemo<Bucket[]>(() => {
    const nowDate = new Date(now);
    const out: Bucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(nowDate);
      d.setUTCDate(d.getUTCDate() - i);
      const dayKey = d.toISOString().slice(0, 10);
      out.push({ day: dayKey.slice(5), key: dayKey, total: 0, error: 0, warn: 0 });
    }
    logs.forEach((l) => {
      const dk = l.at.slice(0, 10);
      const b = out.find((x) => x.key === dk);
      if (b) {
        b.total++;
        if (l.level === 'error') b.error++;
        else if (l.level === 'warn') b.warn++;
      }
    });
    return out;
  }, [logs, now]);

  const onExport = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fau-logs-${now.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="日志管理"
        description="审计、探测、Webhook 与系统日志的统一视图。可按来源、级别、时间筛选并导出。"
        actions={
          <>
            <RefreshButton />
            <button type="button" className="btn" onClick={onExport}>
              <Icon d="ext" size={13} /> 导出
            </button>
            {clearLogs && (
              <button type="button" className="btn btn-danger" onClick={() => setClearOpen(true)}>
                <Icon d="trash" size={13} /> 清除日志
              </button>
            )}
          </>
        }
      />

      {/* Stat row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <StatCard
          label="24 小时事件"
          value={summary.last24h.total.toLocaleString()}
          sub={`Info ${summary.last24h.info.toLocaleString()} · Debug ${summary.last24h.debug || 0}`}
          icon="dashboard"
        />
        <StatCard
          label="错误"
          value={summary.last24h.error}
          tone="rose"
          sub="过去 24 小时"
          icon="incidents"
        />
        <StatCard
          label="警告"
          value={summary.last24h.warn}
          tone="amber"
          sub="过去 24 小时"
          icon="incidents"
        />
        <StatCard
          label="保留 / 占用"
          value={`${summary.retentionDays} 天`}
          sub={`磁盘 ${summary.diskUsedMb} MB`}
          icon="dashboard"
        />
      </div>

      {/* Volume chart */}
      <section className="card" style={{ padding: 16, marginBottom: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>过去 7 天日志量</h2>
          <span className="subtle" style={{ fontSize: 11 }}>
            红色条 = 当天包含 Error
          </span>
        </div>
        <VolumeBars buckets={buckets} />
      </section>

      {/* Filter bar */}
      <div
        className="card"
        style={{
          padding: 12,
          marginBottom: 12,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div
          className="row"
          style={{
            gap: 4,
            padding: 2,
            background: 'var(--bg-subtle)',
            borderRadius: 6,
            border: '1px solid var(--border)',
          }}
        >
          {(
            [
              { v: 'all', l: '全部' },
              { v: 'error', l: 'Error' },
              { v: 'warn', l: 'Warn' },
              { v: 'info', l: 'Info' },
              { v: 'debug', l: 'Debug' },
            ] as Array<{ v: LevelFilter; l: string }>
          ).map((o) => {
            const active = level === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => setLevel(o.v)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '3px 9px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: active ? 500 : 400,
                  color: active ? 'var(--fg)' : 'var(--fg-muted)',
                  background: active ? 'var(--bg-elevated)' : 'transparent',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {o.l}
              </button>
            );
          })}
        </div>

        <select
          className="select"
          value={source}
          onChange={(e) => setSource(e.target.value as SourceFilter)}
          style={{ width: 140, height: 30, fontSize: 12 }}
        >
          <option value="all">全部来源</option>
          <option value="audit">审计</option>
          <option value="probe">探测</option>
          <option value="webhook">Webhook</option>
          <option value="system">系统</option>
        </select>

        <select
          className="select"
          value={range}
          onChange={(e) => setRange(e.target.value as RangeFilter)}
          style={{ width: 110, height: 30, fontSize: 12 }}
        >
          <option value="1h">1 小时</option>
          <option value="24h">24 小时</option>
          <option value="7d">7 天</option>
          <option value="all">全部</option>
        </select>

        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span
            style={{
              position: 'absolute',
              top: '50%',
              left: 9,
              transform: 'translateY(-50%)',
              color: 'var(--fg-subtle)',
              pointerEvents: 'none',
            }}
          >
            <Icon d="search" size={12} />
          </span>
          <input
            className="input"
            placeholder="搜索目标、消息、actor、action…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ height: 30, fontSize: 12, paddingLeft: 28 }}
          />
        </div>

        {(level !== 'all' || source !== 'all' || range !== '24h' || query) && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setLevel('all');
              setSource('all');
              setRange('24h');
              setQuery('');
            }}
          >
            <Icon d="x" size={11} /> 清除
          </button>
        )}

        <span className="subtle tabular" style={{ fontSize: 11, marginLeft: 'auto' }}>
          {filtered.length.toLocaleString()} / {logs.length.toLocaleString()} 条
        </span>
      </div>

      {/* Logs table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="t" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ width: 140 }}>时间</th>
              <th style={{ width: 78 }}>级别</th>
              <th style={{ width: 90 }}>来源</th>
              <th style={{ width: 140 }}>Actor</th>
              <th style={{ width: 150 }}>Action</th>
              <th>消息</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: '48px 20px',
                    textAlign: 'center',
                    color: 'var(--fg-muted)',
                    fontSize: 13,
                  }}
                >
                  未找到匹配的日志条目
                </td>
              </tr>
            ) : (
              filtered.map((l) => (
                <tr key={l.id} onClick={() => setSelectedId(l.id)} style={{ cursor: 'pointer' }}>
                  <td className="tabular subtle" style={{ fontSize: 11.5 }}>
                    <div>
                      {l.at.slice(5, 10)} {l.at.slice(11, 19)}
                    </div>
                    <div className="subtle" style={{ fontSize: 10.5, marginTop: 1 }}>
                      {relTime(l.at, now)}
                    </div>
                  </td>
                  <td>
                    <LevelChip level={l.level} />
                  </td>
                  <td>
                    <SourceBadge source={l.source} />
                  </td>
                  <td
                    className="mono subtle"
                    style={{
                      fontSize: 11.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={l.actor}
                  >
                    {l.actor}
                  </td>
                  <td
                    className="mono"
                    style={{
                      fontSize: 11.5,
                      color: 'var(--fg-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={l.action}
                  >
                    {l.action}
                  </td>
                  <td style={{ fontSize: 12.5, overflow: 'hidden' }}>
                    <div
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{l.target}</span>
                      <span className="subtle" style={{ marginLeft: 8 }}>
                        {l.message}
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail sheet */}
      <Sheet
        open={!!selected}
        onClose={() => setSelectedId(null)}
        eyebrow="Log"
        title={selected?.action ?? '日志详情'}
        footer={
          <>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn" onClick={() => setSelectedId(null)}>
              关闭
            </button>
          </>
        }
      >
        {selected && (
          <>
            <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <LevelChip level={selected.level} />
              <SourceBadge source={selected.source} />
              <span className="subtle tabular" style={{ fontSize: 11.5 }}>
                {selected.at}
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '90px 1fr',
                gap: '10px 16px',
                fontSize: 12.5,
                marginBottom: 18,
              }}
            >
              <span className="subtle">Actor</span>
              <span className="mono">{selected.actor}</span>
              <span className="subtle">Action</span>
              <span className="mono">{selected.action}</span>
              <span className="subtle">Target</span>
              <span>{selected.target}</span>
              <span className="subtle">Message</span>
              <span>{selected.message || '—'}</span>
            </div>
            <div
              style={{
                marginBottom: 10,
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--fg-subtle)',
              }}
            >
              Meta · JSON
            </div>
            <pre
              className="mono"
              style={{
                margin: 0,
                padding: 14,
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 11.5,
                lineHeight: 1.55,
                overflow: 'auto',
                maxHeight: 360,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {JSON.stringify(selected.meta ?? {}, null, 2)}
            </pre>
          </>
        )}
      </Sheet>

      {/* Clear-logs sheet */}
      <Sheet
        open={clearOpen}
        onClose={() => !clearBusy && setClearOpen(false)}
        eyebrow="Maintenance"
        title="清除日志"
        footer={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => setClearOpen(false)}
              disabled={clearBusy}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={runClear}
              disabled={clearBusy}
            >
              {clearBusy ? '清除中…' : '确认清除'}
            </button>
          </>
        }
      >
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <p className="subtle" style={{ marginTop: 0, marginBottom: 14 }}>
            按类别与保留天数删除旧日志。保留天数为 0 时清空该类别全部记录。
          </p>

          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--fg-muted)',
                marginBottom: 8,
              }}
            >
              清除范围
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {(
                [
                  { v: 'all', label: '全部' },
                  { v: 'audit', label: '审计' },
                  { v: 'probe', label: '探测' },
                  { v: 'webhook', label: 'Webhook' },
                  { v: 'system', label: '系统' },
                ] as Array<{ v: ClearScope; label: string }>
              ).map((o) => {
                const active = clearScope === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setClearScope(o.v)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      textAlign: 'center',
                      padding: '8px 4px',
                      fontSize: 12,
                      fontWeight: active ? 600 : 500,
                      color: active ? 'var(--fg)' : 'var(--fg-muted)',
                      background: active ? 'var(--bg-subtle)' : 'transparent',
                      border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                      borderRadius: 6,
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--fg-muted)',
                marginBottom: 8,
              }}
            >
              保留天数
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
              {[7, 30, 90, 180, 365, 0].map((d) => {
                const active = clearKeepDays === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setClearKeepDays(d)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      textAlign: 'center',
                      padding: '8px 4px',
                      fontSize: 12,
                      fontWeight: active ? 600 : 500,
                      color: active ? 'var(--fg)' : 'var(--fg-muted)',
                      background: active ? 'var(--bg-subtle)' : 'transparent',
                      border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                      borderRadius: 6,
                    }}
                  >
                    {d === 0 ? '全清' : `${d} 天`}
                  </button>
                );
              })}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
              <span className="subtle" style={{ fontSize: 11 }}>
                自定义
              </span>
              <input
                type="number"
                className="input tabular"
                min={0}
                max={3650}
                value={clearKeepDays}
                onChange={(e) =>
                  setClearKeepDays(Math.max(0, Math.min(3650, Number(e.target.value) || 0)))
                }
                style={{ width: 100 }}
              />
              <span className="subtle" style={{ fontSize: 11 }}>
                天
              </span>
            </div>
          </div>

          <div
            style={{
              fontSize: 12,
              padding: '10px 12px',
              background: 'var(--st-major-bg)',
              color: 'var(--st-major)',
              border: '1px solid color-mix(in oklab, var(--st-major) 30%, var(--border))',
              borderRadius: 6,
              lineHeight: 1.5,
            }}
          >
            {clearKeepDays === 0 ? (
              <>
                ⚠ 将<strong>完全清空</strong>所选类别的全部记录,操作不可撤销。
              </>
            ) : (
              <>
                将删除所选类别中创建时间早于 <strong>{clearKeepDays}</strong>{' '}
                天之前的所有记录,操作不可撤销。
              </>
            )}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
