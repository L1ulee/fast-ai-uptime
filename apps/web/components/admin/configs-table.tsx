'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  Badge,
  DangerButton,
  Field,
  IconButton,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionH,
  Table,
  Td,
  TextInput,
  Th,
} from '@/components/admin/forms';
import { Icon } from '@/components/admin/icon';
import { StyledCheckbox } from '@/components/admin/styled-checkbox';
import { Sheet } from '@/components/ui/sheet';

import { HTTP_METHODS, type HttpMethod } from './admin-shared';
export { HTTP_METHODS };
export type { HttpMethod };

export interface HeaderPairUi {
  key: string;
  val: string;
}

export interface ConfigRow {
  id: number;
  groupId: number | null;
  groupSlug: string | null;
  groupDisplayName: string | null;
  modelId: number;
  modelName: string;
  providerType: string;
  providerBaseUrl: string | null;
  providerHasApiKey: boolean;
  displayName: string;
  endpoint: string | null;
  endpointPath: string | null;
  method: HttpMethod;
  headers: HeaderPairUi[];
  requestBody: string | null;
  enabled: boolean;
  isMaintenance: boolean;
  pollIntervalSeconds: number;
  timeoutMs: number;
  sortOrder: number;
  hasOwnApiKey: boolean;
  latestStatus: 'ok' | 'degraded' | 'down' | 'timeout' | null;
  latestLatencyMs: number | null;
  uptime30dDaily: number[];
  uptime30dAvg: number | null;
}

export interface GroupOption {
  id: number;
  displayName: string;
  slug: string;
  sortOrder: number;
}

export interface ModelOption {
  id: number;
  modelName: string;
  providerName: string;
  providerType: string;
}

export interface RunNowResult {
  ok: boolean;
  throttled?: boolean;
  message: string;
}

export interface RunAllResult {
  ok: boolean;
  ran: number;
  throttled: number;
  message: string;
}

/** Admin "探测默认值" —— 来自系统设置,用于新建组件表单的初始值。 */
export interface ProbeDefaults {
  pollIntervalSeconds: number;
  timeoutMs: number;
}

interface Props {
  groups: GroupOption[];
  models: ModelOption[];
  configs: ConfigRow[];
  /** 若未传则回退到内置 60/30000(向后兼容)。 */
  probeDefaults?: ProbeDefaults;
  createConfig: (formData: FormData) => Promise<void>;
  editConfig: (formData: FormData) => Promise<void>;
  deleteConfig: (id: number) => Promise<void>;
  runNow: (id: number) => Promise<RunNowResult>;
  runAllNow: () => Promise<RunAllResult>;
  bulkAction: (formData: FormData) => Promise<void>;
}

const FALLBACK_PROBE_DEFAULTS: ProbeDefaults = { pollIntervalSeconds: 60, timeoutMs: 30000 };

type ToastKind = 'success' | 'error' | 'info';
interface ToastState {
  kind: ToastKind;
  text: string;
}

type DrawerMode = { kind: 'create' } | { kind: 'edit'; row: ConfigRow } | null;

const STATUS_PILL_MAP: Record<
  NonNullable<ConfigRow['latestStatus']> | 'unknown',
  { tone: 'green' | 'amber' | 'rose' | 'neutral'; label: string }
> = {
  ok: { tone: 'green', label: '正常' },
  degraded: { tone: 'amber', label: '降级' },
  down: { tone: 'rose', label: '中断' },
  timeout: { tone: 'rose', label: '超时' },
  unknown: { tone: 'neutral', label: '未知' },
};

function StatusPill({ s }: { s: ConfigRow['latestStatus'] }) {
  const m = STATUS_PILL_MAP[s ?? 'unknown'];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function effectiveEndpointOf(c: ConfigRow): string | null {
  return (
    c.endpoint ??
    (c.providerBaseUrl && c.endpointPath
      ? `${c.providerBaseUrl}${c.endpointPath.startsWith('/') ? '' : '/'}${c.endpointPath}`
      : null)
  );
}

function isoDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** 30 段日可用率柱条；每段 hover 显示日期 + 可用率（tip 样式由 globals.css 控制）。 */
function UptimeStrip({ daily }: { daily: number[] }) {
  if (daily.length === 0) {
    return (
      <span className="subtle" style={{ fontSize: 11 }}>
        —
      </span>
    );
  }
  const n = daily.length;
  return (
    <div className="bar-strip" style={{ display: 'flex', gap: 1, height: 8, flex: 1 }}>
      {daily.map((d, i) => {
        const tone = d >= 99.9 ? 'var(--st-op)' : d >= 95 ? 'var(--st-deg)' : 'var(--st-major)';
        const date = isoDateNDaysAgo(n - 1 - i);
        return (
          <div
            key={i}
            className="tip-wrap"
            style={{
              flex: 1,
              background: tone,
              opacity: d >= 99.9 ? 1 : 0.85,
              borderRadius: 1,
              minHeight: '100%',
              position: 'relative',
            }}
          >
            <div className="tip">
              <div className="tip-head">{date}</div>
              <div className="tip-grid">
                <span className="tip-key">可用率</span>
                <span className="tabular">{`${d.toFixed(1)}%`}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface GroupSection {
  groupId: number | null;
  groupName: string;
  groupSlug: string | null;
  rows: ConfigRow[];
}

function sectionsByGroup(configs: ConfigRow[], groups: GroupOption[]): GroupSection[] {
  const byGroup = new Map<number | string, ConfigRow[]>();
  for (const c of configs) {
    const key = c.groupId ?? '__ungrouped__';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(c);
  }
  const out: GroupSection[] = [];
  for (const g of groups) {
    const rows = byGroup.get(g.id) ?? [];
    if (rows.length > 0) {
      out.push({ groupId: g.id, groupName: g.displayName, groupSlug: g.slug, rows });
    }
  }
  const ungrouped = byGroup.get('__ungrouped__') ?? [];
  if (ungrouped.length > 0) {
    out.push({ groupId: null, groupName: '未分组', groupSlug: null, rows: ungrouped });
  }
  return out;
}

/** Lightweight key/value editor for HTTP request headers; emits `header_key[]` + `header_val[]`. */
function HeadersEditor({
  value,
  onChange,
}: {
  value: HeaderPairUi[];
  onChange: (next: HeaderPairUi[]) => void;
}) {
  const rows = value.length > 0 ? value : [{ key: '', val: '' }];
  const updateRow = (i: number, patch: Partial<HeaderPairUi>) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  const removeRow = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    onChange(next.length > 0 ? next : [{ key: '', val: '' }]);
  };
  const addRow = () => onChange([...rows, { key: '', val: '' }]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 28px', gap: 6 }}>
          <input
            className="input mono"
            style={{ height: 30, fontSize: 12 }}
            placeholder="Header-Name"
            name="header_key"
            value={r.key}
            onChange={(e) => updateRow(i, { key: e.target.value })}
          />
          <input
            className="input mono"
            style={{ height: 30, fontSize: 12 }}
            placeholder="value"
            name="header_val"
            value={r.val}
            onChange={(e) => updateRow(i, { val: e.target.value })}
          />
          <button
            type="button"
            className="btn btn-sm btn-ghost btn-icon"
            title="删除"
            onClick={() => removeRow(i)}
            style={{ height: 30, width: 28 }}
          >
            <Icon d="trash" size={11} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={addRow}
        style={{ alignSelf: 'flex-start', height: 26, fontSize: 11.5, color: 'var(--fg-muted)' }}
      >
        <Icon d="plus" size={11} /> 添加请求头
      </button>
    </div>
  );
}

function bodyDefaultFor(modelName: string): string {
  return `{\n  "model": "${modelName}",\n  "messages": [{ "role": "user", "content": "ping" }],\n  "max_tokens": 1\n}`;
}

function defaultHeadersForCreate(): HeaderPairUi[] {
  return [
    { key: 'Content-Type', val: 'application/json' },
    { key: 'Authorization', val: 'Bearer {{API_KEY}}' },
  ];
}

export function ConfigsTable({
  groups,
  models,
  configs,
  probeDefaults = FALLBACK_PROBE_DEFAULTS,
  createConfig,
  editConfig,
  deleteConfig,
  runNow,
  runAllNow,
  bulkAction,
}: Props) {
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set());
  const [runningAll, setRunningAll] = useState(false);
  const [, startSave] = useTransition();
  const [, startDelete] = useTransition();
  const [, startBulk] = useTransition();
  const close = () => setDrawer(null);
  const editing = drawer?.kind === 'edit' ? drawer.row : null;

  const sections = useMemo(() => sectionsByGroup(configs, groups), [configs, groups]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const toggle = (id: number) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  const toggleGroup = (rows: ConfigRow[]) => {
    const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
    const next = new Set(selected);
    if (allSelected) rows.forEach((r) => next.delete(r.id));
    else rows.forEach((r) => next.add(r.id));
    setSelected(next);
  };

  const handleCreate = async (fd: FormData): Promise<void> => {
    startSave(async () => {
      try {
        await createConfig(fd);
        setDrawer(null);
        setToast({ kind: 'success', text: '已创建' });
      } catch (err) {
        setToast({ kind: 'error', text: err instanceof Error ? err.message : '创建失败' });
      }
    });
  };

  const handleEdit = async (fd: FormData): Promise<void> => {
    startSave(async () => {
      try {
        await editConfig(fd);
        setDrawer(null);
        setToast({ kind: 'success', text: '已保存' });
      } catch (err) {
        setToast({ kind: 'error', text: err instanceof Error ? err.message : '保存失败' });
      }
    });
  };

  const handleDelete = (id: number) => {
    startDelete(async () => {
      try {
        await deleteConfig(id);
        setDrawer(null);
        setToast({ kind: 'success', text: '已删除' });
      } catch (err) {
        setToast({ kind: 'error', text: err instanceof Error ? err.message : '删除失败' });
      }
    });
  };

  const handleBulk = async (fd: FormData): Promise<void> => {
    startBulk(async () => {
      try {
        await bulkAction(fd);
        setSelected(new Set());
        setToast({ kind: 'success', text: '批量操作完成' });
      } catch (err) {
        setToast({ kind: 'error', text: err instanceof Error ? err.message : '操作失败' });
      }
    });
  };

  const handleRunNow = async (id: number) => {
    setRunningIds((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
    try {
      const result = await runNow(id);
      setToast({ kind: result.ok ? 'success' : 'info', text: result.message });
    } catch (err) {
      setToast({ kind: 'error', text: err instanceof Error ? err.message : '探测失败' });
    } finally {
      setRunningIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRunAll = async () => {
    if (runningAll) return;
    setRunningAll(true);
    setToast({ kind: 'info', text: '正在批量探测…' });
    try {
      const result = await runAllNow();
      setToast({ kind: 'success', text: result.message });
    } catch (err) {
      setToast({ kind: 'error', text: err instanceof Error ? err.message : '批量探测失败' });
    } finally {
      setRunningAll(false);
    }
  };

  return (
    <>
      <PageHeader
        title="探测组件"
        description="主动探测各 Provider 的 HTTP 端点（自定义 method / headers / body）。"
        actions={
          <>
            <SecondaryButton
              size="md"
              onClick={handleRunAll}
              disabled={runningAll || configs.length === 0}
              title={configs.length === 0 ? '暂无组件' : '立即探测所有启用的组件'}
            >
              <Icon d="refresh" size={13} className={runningAll ? 'spin' : undefined} />{' '}
              {runningAll ? '探测中…' : '立即探测全部'}
            </SecondaryButton>
            <PrimaryButton
              size="md"
              onClick={() => setDrawer({ kind: 'create' })}
              disabled={models.length === 0}
              title={models.length === 0 ? '请先添加模型' : ''}
            >
              <Icon d="plus" size={13} /> 新建组件
            </PrimaryButton>
          </>
        }
      />

      {/* Bulk action bar */}
      <form
        action={handleBulk}
        className="card"
        style={{
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: selected.size > 0 ? 'var(--brand-bg)' : 'var(--bg-elevated)',
          borderColor: selected.size > 0 ? 'var(--brand-border)' : 'var(--border)',
          transition: 'all 160ms',
          flexWrap: 'wrap',
        }}
      >
        {Array.from(selected).map((id) => (
          <input key={id} type="hidden" name="selected" value={id} />
        ))}
        <span style={{ fontSize: 12, fontWeight: 500 }}>
          {selected.size > 0 ? (
            <span style={{ color: 'var(--brand)' }}>已选 {selected.size} 个</span>
          ) : (
            <span className="subtle">勾选组件后批量操作</span>
          )}
        </span>
        <div className="row" style={{ gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <SecondaryButton
            type="submit"
            name="bulk_action"
            value="enable"
            disabled={selected.size === 0}
          >
            <Icon d="play" size={12} /> 启用
          </SecondaryButton>
          <SecondaryButton
            type="submit"
            name="bulk_action"
            value="disable"
            disabled={selected.size === 0}
          >
            <Icon d="pause" size={12} /> 禁用
          </SecondaryButton>
          <SecondaryButton
            type="submit"
            name="bulk_action"
            value="maintenance_on"
            disabled={selected.size === 0}
          >
            <Icon d="maint" size={12} /> 进入维护
          </SecondaryButton>
          <SecondaryButton
            type="submit"
            name="bulk_action"
            value="maintenance_off"
            disabled={selected.size === 0}
          >
            退出维护
          </SecondaryButton>
          <DangerButton
            type="submit"
            name="bulk_action"
            value="delete"
            disabled={selected.size === 0}
          >
            <Icon d="trash" size={12} /> 删除
          </DangerButton>
        </div>
      </form>

      {/* Grouped tables */}
      {sections.length === 0 ? (
        <div className="card subtle" style={{ padding: 32, textAlign: 'center', fontSize: 12 }}>
          尚无组件，点击右上角「新建组件」添加
        </div>
      ) : (
        sections.map((s) => {
          const groupAllSelected = s.rows.length > 0 && s.rows.every((r) => selected.has(r.id));
          const groupAnySelected = s.rows.some((r) => selected.has(r.id));
          return (
            <section key={`group-${s.groupId ?? 'ungrouped'}`} style={{ marginBottom: 22 }}>
              <div className="row" style={{ marginBottom: 10, gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => toggleGroup(s.rows)}
                  title={groupAllSelected ? '取消选择本组' : '全选本组'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--fg-muted)',
                    padding: 0,
                    fontSize: 11,
                  }}
                >
                  <StyledCheckbox
                    checked={groupAllSelected}
                    onChange={() => toggleGroup(s.rows)}
                    ariaLabel={`select all in ${s.groupName}`}
                  />
                  <span>
                    {groupAllSelected ? '取消全选' : groupAnySelected ? '继续全选' : '全选本组'}
                  </span>
                </button>
                <SectionH style={{ margin: 0 }}>{s.groupName}</SectionH>
                <span className="subtle" style={{ fontSize: 11 }}>
                  {s.rows.length} 个组件{s.groupSlug ? ` · slug: ${s.groupSlug}` : ''}
                </span>
              </div>
              <div className="card" style={{ overflow: 'visible' }}>
                <Table>
                  <thead>
                    <tr>
                      <Th style={{ width: 30 }}>{''}</Th>
                      <Th>名称</Th>
                      <Th style={{ width: 100 }}>状态</Th>
                      <Th style={{ width: 130 }}>30d 可用率</Th>
                      <Th style={{ width: 90 }}>延迟</Th>
                      <Th style={{ width: 110 }}>API Key</Th>
                      <Th style={{ width: 80 }}>{''}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setDrawer({ kind: 'edit', row: c })}
                        style={{ cursor: 'pointer' }}
                      >
                        <Td onClick={(e) => e.stopPropagation()}>
                          <StyledCheckbox
                            checked={selected.has(c.id)}
                            onChange={() => toggle(c.id)}
                            ariaLabel={`select ${c.displayName}`}
                          />
                        </Td>
                        <Td>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{c.displayName}</div>
                          <div className="subtle mono" style={{ fontSize: 11, marginTop: 2 }}>
                            {c.modelName}
                          </div>
                        </Td>
                        <Td>
                          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                            <StatusPill s={c.latestStatus} />
                            {c.isMaintenance && <Badge tone="blue">维护</Badge>}
                            {!c.enabled && <Badge>已禁用</Badge>}
                          </div>
                        </Td>
                        <Td>
                          <div className="row" style={{ gap: 6 }}>
                            <span
                              className="tabular"
                              style={{ fontSize: 12, fontWeight: 500, minWidth: 50 }}
                            >
                              {c.uptime30dAvg != null ? `${c.uptime30dAvg.toFixed(2)}%` : '—'}
                            </span>
                            <UptimeStrip daily={c.uptime30dDaily} />
                          </div>
                        </Td>
                        <Td className="tabular" style={{ fontSize: 12 }}>
                          {c.latestLatencyMs != null ? (
                            `${c.latestLatencyMs} ms`
                          ) : (
                            <span className="subtle">—</span>
                          )}
                        </Td>
                        <Td>
                          {c.hasOwnApiKey ? (
                            <Badge>已覆盖</Badge>
                          ) : c.providerHasApiKey ? (
                            <Badge tone="green">继承</Badge>
                          ) : (
                            <Badge tone="rose">无</Badge>
                          )}
                        </Td>
                        <Td onClick={(e) => e.stopPropagation()}>
                          <div className="row" style={{ gap: 4 }}>
                            <IconButton
                              title={runningIds.has(c.id) ? '探测中…' : '立即探测'}
                              onClick={() => handleRunNow(c.id)}
                              disabled={runningIds.has(c.id)}
                            >
                              <Icon
                                d="refresh"
                                size={12}
                                className={runningIds.has(c.id) ? 'spin' : undefined}
                              />
                            </IconButton>
                            <IconButton
                              title="编辑"
                              onClick={() => setDrawer({ kind: 'edit', row: c })}
                            >
                              <Icon d="edit" size={12} />
                            </IconButton>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </section>
          );
        })
      )}

      {/* Edit Sheet */}
      <Sheet
        open={drawer?.kind === 'edit'}
        onClose={close}
        eyebrow="Editor"
        title={editing?.displayName ?? '组件'}
        footer={
          editing ? (
            <>
              <DangerButton size="md" onClick={() => handleDelete(editing.id)}>
                <Icon d="trash" size={12} /> 删除
              </DangerButton>
              <div style={{ flex: 1 }} />
              <SecondaryButton
                size="md"
                onClick={() => handleRunNow(editing.id)}
                disabled={runningIds.has(editing.id)}
              >
                <Icon
                  d="refresh"
                  size={12}
                  className={runningIds.has(editing.id) ? 'spin' : undefined}
                />{' '}
                {runningIds.has(editing.id) ? '探测中…' : '立即探测'}
              </SecondaryButton>
              <SecondaryButton size="md" onClick={close}>
                取消
              </SecondaryButton>
              <PrimaryButton size="md" type="submit" form={`config-edit-form-${editing.id}`}>
                保存
              </PrimaryButton>
            </>
          ) : null
        }
      >
        {editing && (
          <EditConfigForm
            key={editing.id}
            editing={editing}
            groups={groups}
            models={models}
            editConfig={handleEdit}
          />
        )}
      </Sheet>

      {/* Create Sheet */}
      <Sheet
        open={drawer?.kind === 'create'}
        onClose={close}
        eyebrow="Editor"
        title="新建探测组件"
        footer={
          <>
            <SecondaryButton size="md" onClick={close}>
              取消
            </SecondaryButton>
            <PrimaryButton size="md" type="submit" form="config-create-form">
              创建
            </PrimaryButton>
          </>
        }
      >
        <CreateConfigForm
          groups={groups}
          models={models}
          probeDefaults={probeDefaults}
          createConfig={handleCreate}
        />
      </Sheet>

      {toast && (
        <div className={`toast toast-${toast.kind}`} role="status" aria-live="polite">
          <span>{toast.text}</span>
        </div>
      )}
    </>
  );
}

function EditConfigForm({
  editing,
  groups,
  models,
  editConfig,
}: {
  editing: ConfigRow;
  groups: GroupOption[];
  models: ModelOption[];
  editConfig: (formData: FormData) => Promise<void>;
}) {
  const [method, setMethod] = useState<HttpMethod>(editing.method);
  const [headers, setHeaders] = useState<HeaderPairUi[]>(
    editing.headers.length > 0 ? editing.headers : defaultHeadersForCreate(),
  );
  const [body, setBody] = useState<string>(
    editing.requestBody ?? bodyDefaultFor(editing.modelName),
  );

  useEffect(() => {
    setMethod(editing.method);
    setHeaders(editing.headers.length > 0 ? editing.headers : defaultHeadersForCreate());
    setBody(editing.requestBody ?? bodyDefaultFor(editing.modelName));
  }, [editing.id, editing.method, editing.headers, editing.requestBody, editing.modelName]);

  return (
    <>
      <div className="row" style={{ gap: 10, marginBottom: 18 }}>
        <StatusPill s={editing.latestStatus} />
        <span className="subtle" style={{ fontSize: 12 }}>
          最近一次延迟{' '}
          <span className="tabular" style={{ color: 'var(--fg)' }}>
            {editing.latestLatencyMs ?? '—'} ms
          </span>
        </span>
      </div>
      <form
        id={`config-edit-form-${editing.id}`}
        action={editConfig}
        className="fade-in"
        onInput={(e) => {
          const t = e.target as HTMLInputElement;
          if (t.name === 'endpoint' || t.name === 'endpoint_path') {
            const pathInput = e.currentTarget.querySelector<HTMLInputElement>(
              'input[name="endpoint_path"]',
            );
            pathInput?.setCustomValidity('');
          }
        }}
        onSubmit={(e) => {
          const fd = new FormData(e.currentTarget);
          const ep = String(fd.get('endpoint') ?? '').trim();
          const epp = String(fd.get('endpoint_path') ?? '').trim();
          if (!ep && !epp) {
            e.preventDefault();
            const pathInput = e.currentTarget.querySelector<HTMLInputElement>(
              'input[name="endpoint_path"]',
            );
            if (pathInput) {
              pathInput.setCustomValidity('请填写「请求 URL」或下方「完整 endpoint URL」');
              pathInput.reportValidity();
            }
          }
        }}
      >
        <input type="hidden" name="id" value={editing.id} />
        <Field label="显示名称">
          <TextInput name="display_name" defaultValue={editing.displayName} required />
        </Field>
        <Field label="模型">
          <select className="select" name="model_id" defaultValue={editing.modelId} required>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                [{m.providerType}] {m.providerName} / {m.modelName}
              </option>
            ))}
          </select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
          <Field label="请求方法">
            <select
              className="select"
              name="method"
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="请求 URL" hint="相对路径，与 Provider.baseUrl 拼接。例：/chat/completions">
            <TextInput
              name="endpoint_path"
              defaultValue={editing.endpointPath ?? ''}
              className="mono"
              placeholder="/chat/completions"
            />
          </Field>
        </div>
        <Field label="完整 endpoint URL（可选 / 覆盖）" hint="留空时由 baseUrl + 请求 URL 拼接">
          <TextInput name="endpoint" defaultValue={editing.endpoint ?? ''} className="mono" />
        </Field>
        <Field label="分组">
          <select className="select" name="group_id" defaultValue={editing.groupId ?? ''}>
            <option value="">— 未分组 —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="请求头" hint="支持 {{API_KEY}} {{model}} {{timestamp}} 模板">
          <HeadersEditor value={headers} onChange={setHeaders} />
        </Field>
        {method !== 'GET' && method !== 'HEAD' && (
          <Field label="请求体" hint="JSON 或原文本；同样支持模板">
            <textarea
              className="textarea mono"
              name="request_body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="探测间隔（秒）">
            <TextInput
              name="poll_interval_seconds"
              type="number"
              defaultValue={editing.pollIntervalSeconds}
              min={15}
              max={31536000}
              className="tabular"
            />
          </Field>
          <Field label="超时（毫秒）">
            <TextInput
              name="timeout_ms"
              type="number"
              defaultValue={editing.timeoutMs}
              min={1000}
              max={120000}
              className="tabular"
            />
          </Field>
        </div>
        <Field label="排序">
          <TextInput
            name="sort_order"
            type="number"
            defaultValue={editing.sortOrder}
            className="tabular"
          />
        </Field>
        <Field
          label={editing.hasOwnApiKey ? '覆盖 API Key' : '设置 API Key 覆盖'}
          hint="留空表示沿用 Provider 级 Key"
        >
          <div style={{ marginBottom: 6 }}>
            {editing.hasOwnApiKey ? (
              <Badge tone="green">组件级覆盖</Badge>
            ) : editing.providerHasApiKey ? (
              <Badge>继承 Provider</Badge>
            ) : (
              <Badge tone="rose">无</Badge>
            )}
          </div>
          <TextInput name="api_key" type="password" autoComplete="off" placeholder="sk-…" />
          <div className="subtle" style={{ marginTop: 6, fontSize: 11 }}>
            填写后保存即覆盖；留空则保留原值
          </div>
          {editing.hasOwnApiKey && (
            <label className="row" style={{ gap: 8, marginTop: 6, fontSize: 11 }}>
              <input type="checkbox" name="clear_api_key" />
              <span style={{ color: 'var(--st-major)' }}>清空（改为继承 Provider）</span>
            </label>
          )}
        </Field>
      </form>
    </>
  );
}

function CreateConfigForm({
  groups,
  models,
  probeDefaults,
  createConfig,
}: {
  groups: GroupOption[];
  models: ModelOption[];
  probeDefaults: ProbeDefaults;
  createConfig: (formData: FormData) => Promise<void>;
}) {
  const [method, setMethod] = useState<HttpMethod>('POST');
  const [headers, setHeaders] = useState<HeaderPairUi[]>(defaultHeadersForCreate());
  const [body, setBody] = useState<string>(bodyDefaultFor(models[0]?.modelName ?? ''));

  return (
    <form
      id="config-create-form"
      action={createConfig}
      className="fade-in"
      onInput={(e) => {
        const t = e.target as HTMLInputElement;
        if (t.name === 'endpoint' || t.name === 'endpoint_path') {
          const pathInput = e.currentTarget.querySelector<HTMLInputElement>(
            'input[name="endpoint_path"]',
          );
          pathInput?.setCustomValidity('');
        }
      }}
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        const ep = String(fd.get('endpoint') ?? '').trim();
        const epp = String(fd.get('endpoint_path') ?? '').trim();
        if (!ep && !epp) {
          e.preventDefault();
          const pathInput = e.currentTarget.querySelector<HTMLInputElement>(
            'input[name="endpoint_path"]',
          );
          if (pathInput) {
            pathInput.setCustomValidity('请填写「请求 URL」或下方「完整 endpoint URL」');
            pathInput.reportValidity();
          }
        }
      }}
    >
      <Field label="模型">
        <select className="select" name="model_id" required>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              [{m.providerType}] {m.providerName} / {m.modelName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="分组">
        <select className="select" name="group_id" defaultValue="">
          <option value="">— 未分组 —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.displayName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="显示名称" hint='公开页展示，如 "GPT-4o (Chat)"'>
        <TextInput name="display_name" placeholder="GPT-4o (Chat)" required />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
        <Field label="请求方法">
          <select
            className="select"
            name="method"
            value={method}
            onChange={(e) => setMethod(e.target.value as HttpMethod)}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="请求 URL" hint="与 Provider.baseUrl 拼接">
          <TextInput name="endpoint_path" placeholder="/chat/completions" className="mono" />
        </Field>
      </div>
      <Field label="完整 endpoint URL（可选 / 覆盖）">
        <TextInput
          name="endpoint"
          placeholder="https://api.openai.com/v1/chat/completions"
          className="mono"
        />
      </Field>
      <Field label="请求头" hint="支持 {{API_KEY}} {{model}} {{timestamp}} 模板">
        <HeadersEditor value={headers} onChange={setHeaders} />
      </Field>
      {method !== 'GET' && method !== 'HEAD' && (
        <Field label="请求体" hint="JSON 或原文本">
          <textarea
            className="textarea mono"
            name="request_body"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder='{"model": "...", "messages": [...]}'
          />
        </Field>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field
          label="探测间隔（秒）"
          hint={`15-31536000，默认 ${probeDefaults.pollIntervalSeconds}`}
        >
          <TextInput
            name="poll_interval_seconds"
            type="number"
            defaultValue={probeDefaults.pollIntervalSeconds}
            min={15}
            max={31536000}
            className="tabular"
          />
        </Field>
        <Field label="超时（毫秒）" hint={`1000-120000，默认 ${probeDefaults.timeoutMs}`}>
          <TextInput
            name="timeout_ms"
            type="number"
            defaultValue={probeDefaults.timeoutMs}
            min={1000}
            max={120000}
            className="tabular"
          />
        </Field>
      </div>
      <Field label="排序">
        <TextInput name="sort_order" type="number" defaultValue={0} className="tabular" />
      </Field>
      <Field label="API Key 覆盖（可选）" hint="留空使用 Provider 共享 Key">
        <TextInput name="api_key" type="password" placeholder="sk-…" autoComplete="off" />
      </Field>
    </form>
  );
}
