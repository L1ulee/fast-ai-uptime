'use client';

import { useState } from 'react';
import {
  Badge,
  DangerButton,
  Divider,
  Field,
  IconButton,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionH,
  Table,
  Td,
  TextInput,
  Textarea,
  Th,
} from '@/components/admin/forms';
import { Icon } from '@/components/admin/icon';
import { Pagination } from '@/components/admin/pagination';
import { StyledCheckbox } from '@/components/admin/styled-checkbox';
import { Markdown } from '@/components/ui/markdown';
import { Sheet } from '@/components/ui/sheet';
import { Toast, useDrawerActions } from '@/components/admin/use-drawer-actions';

import {
  STATUS_OPTIONS,
  IMPACT_OPTIONS,
  type IncidentStatus,
  type IncidentImpact,
} from './incidents-shared';
export { STATUS_OPTIONS, IMPACT_OPTIONS };
export type { IncidentStatus, IncidentImpact };

const STATUS_MAP: Record<
  IncidentStatus,
  { tone: 'amber' | 'orange' | 'violet' | 'green'; label: string }
> = {
  investigating: { tone: 'amber', label: '调查中' },
  identified: { tone: 'orange', label: '已定位' },
  monitoring: { tone: 'violet', label: '观察中' },
  resolved: { tone: 'green', label: '已解决' },
};

const IMPACT_MAP: Record<IncidentImpact, 'green' | 'amber' | 'orange' | 'rose'> = {
  none: 'green',
  minor: 'amber',
  major: 'orange',
  critical: 'rose',
};

function StatusBadge({ s }: { s: IncidentStatus }) {
  const m = STATUS_MAP[s];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function ImpactBadge({ i }: { i: IncidentImpact }) {
  return <Badge tone={IMPACT_MAP[i]}>{i}</Badge>;
}

export interface IncidentUpdateRow {
  id: number;
  incidentId: number;
  status: IncidentStatus;
  impact: IncidentImpact;
  bodyMd: string;
  createdAt: string;
  /** 该条更新发布时的受影响组件快照。 */
  affected: Array<{ configId: number; name: string }>;
}

export interface IncidentRow {
  id: number;
  title: string;
  status: IncidentStatus;
  impact: IncidentImpact;
  isPublic: boolean;
  source: 'manual' | 'auto';
  startedAt: string;
  resolvedAt: string | null;
  updates: IncidentUpdateRow[];
  affected: Array<{ configId: number; name: string }>;
}

export interface ConfigOption {
  id: number;
  name: string;
}

interface Props {
  activeIncidents: IncidentRow[];
  resolvedIncidents: IncidentRow[];
  resolvedTotal: number;
  resolvedPage: number;
  configs: ConfigOption[];
  /** 站点时区(IANA name);所有时间显示与录入按此解释。 */
  siteTimezone: string;
  createIncident: (formData: FormData) => Promise<void>;
  editIncident: (formData: FormData) => Promise<void>;
  addUpdate: (formData: FormData) => Promise<void>;
  editUpdate: (formData: FormData) => Promise<void>;
  deleteUpdate: (formData: FormData) => Promise<void>;
  deleteIncident: (formData: FormData) => Promise<void>;
  bulkDeleteIncidents: (formData: FormData) => Promise<void>;
  bulkEditIncidents: (formData: FormData) => Promise<void>;
}

type DrawerMode = { kind: 'create' } | { kind: 'edit'; id: number } | { kind: 'batch' } | null;

function timeAgo(d: string | Date): string {
  const dt = d instanceof Date ? d : new Date(d);
  const s = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

function durationText(a: string, b: string | null): string {
  if (!b) return '—';
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3600_000).toFixed(1)}h`;
}

import { fmtTz } from '@/lib/timezone';

export function IncidentsTable({
  activeIncidents,
  resolvedIncidents,
  resolvedTotal,
  resolvedPage,
  configs,
  siteTimezone,
  createIncident,
  editIncident,
  addUpdate,
  editUpdate,
  deleteUpdate,
  deleteIncident,
  bulkDeleteIncidents,
  bulkEditIncidents,
}: Props) {
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editingUpdateId, setEditingUpdateId] = useState<number | null>(null);
  const close = () => setDrawer(null);
  const { toast, run } = useDrawerActions();

  // #5：抽屉只存 id，editing 从最新 props 派生 —— revalidate 后时间线自动重渲。
  const editing =
    drawer?.kind === 'edit'
      ? ([...activeIncidents, ...resolvedIncidents].find((r) => r.id === drawer.id) ?? null)
      : null;

  const handleCreate = async (fd: FormData): Promise<void> => {
    run(() => createIncident(fd), close, { okText: '已创建' });
  };
  const handleEdit = async (fd: FormData): Promise<void> => {
    run(() => editIncident(fd), close, { okText: '已保存' });
  };
  const handleDelete = async (fd: FormData): Promise<void> => {
    run(() => deleteIncident(fd), close, { okText: '已删除' });
  };
  const handleAddUpdate = async (fd: FormData): Promise<void> => {
    // 不传 close —— 抽屉保持打开，时间线随 revalidate 实时刷新。
    run(() => addUpdate(fd), undefined, { okText: '更新已添加' });
  };
  const handleEditUpdate = async (fd: FormData): Promise<void> => {
    run(
      () => editUpdate(fd),
      () => setEditingUpdateId(null),
      { okText: '更新已保存' },
    );
  };
  const handleDeleteUpdate = (updateId: number) => {
    if (typeof window !== 'undefined' && !window.confirm('确认删除此更新?')) return;
    const fd = new FormData();
    fd.append('update_id', String(updateId));
    run(
      () => deleteUpdate(fd),
      () => setEditingUpdateId(null),
      { okText: '更新已删除' },
    );
  };
  const handleBulkDelete = async (fd: FormData): Promise<void> => {
    run(
      () => bulkDeleteIncidents(fd),
      () => setSelected(new Set()),
      {
        okText: '批量删除完成',
      },
    );
  };
  const handleBulkEdit = async (fd: FormData): Promise<void> => {
    run(
      () => bulkEditIncidents(fd),
      () => {
        setSelected(new Set());
        close();
      },
      { okText: '批量编辑完成' },
    );
  };

  const toggle = (id: number) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };
  const allSelected =
    activeIncidents.length > 0 && activeIncidents.every((i) => selected.has(i.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(activeIncidents.map((i) => i.id)));
  };
  // 仅保留仍存在于当前进行中列表里的选中项
  const selectedIds = activeIncidents.filter((i) => selected.has(i.id)).map((i) => i.id);

  return (
    <>
      <PageHeader
        title="事件"
        description="人工录入 + 探测联动的故障事件 + 进度更新流，公共页实时显示。"
        actions={
          <PrimaryButton size="md" onClick={() => setDrawer({ kind: 'create' })}>
            <Icon d="plus" size={13} /> 新建事件
          </PrimaryButton>
        }
      />

      {/* Active */}
      <section style={{ marginBottom: 28 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
          <SectionH style={{ margin: 0 }}>进行中 · {activeIncidents.length}</SectionH>
          {selectedIds.length > 0 && (
            <div className="row" style={{ gap: 8 }}>
              <span className="subtle" style={{ fontSize: 12 }}>
                已选 {selectedIds.length}
              </span>
              <SecondaryButton onClick={() => setDrawer({ kind: 'batch' })}>
                <Icon d="edit" size={12} /> 批量编辑
              </SecondaryButton>
              <form action={handleBulkDelete} style={{ display: 'inline' }}>
                {selectedIds.map((id) => (
                  <input key={id} type="hidden" name="selected" value={id} />
                ))}
                <DangerButton type="submit">
                  <Icon d="trash" size={12} /> 删除 {selectedIds.length} 个
                </DangerButton>
              </form>
            </div>
          )}
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <Table>
            <thead>
              <tr>
                <Th style={{ width: 30 }}>
                  <StyledCheckbox checked={allSelected} onChange={toggleAll} ariaLabel="全选" />
                </Th>
                <Th>标题</Th>
                <Th style={{ width: 100 }}>状态</Th>
                <Th style={{ width: 80 }}>影响</Th>
                <Th>受影响组件</Th>
                <Th style={{ width: 140 }}>开始时间</Th>
                <Th style={{ width: 100 }}>{''}</Th>
              </tr>
            </thead>
            <tbody>
              {activeIncidents.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="subtle"
                    style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12 }}
                  >
                    暂无进行中事件
                  </td>
                </tr>
              ) : (
                activeIncidents.map((i) => (
                  <tr
                    key={i.id}
                    onClick={() => setDrawer({ kind: 'edit', id: i.id })}
                    style={{ cursor: 'pointer' }}
                  >
                    <Td onClick={(e) => e.stopPropagation()}>
                      <StyledCheckbox
                        checked={selected.has(i.id)}
                        onChange={() => toggle(i.id)}
                        ariaLabel={`select ${i.title}`}
                      />
                    </Td>
                    <Td>
                      <div className="row" style={{ gap: 6 }}>
                        <span style={{ fontWeight: 500 }}>{i.title}</span>
                        {i.source === 'auto' && (
                          <Badge tone="blue" style={{ fontSize: 9.5 }}>
                            自动
                          </Badge>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <StatusBadge s={i.status} />
                    </Td>
                    <Td>
                      <ImpactBadge i={i.impact} />
                    </Td>
                    <Td className="subtle" style={{ fontSize: 12 }}>
                      {i.affected.length ? i.affected.map((c) => c.name).join('、') : '—'}
                    </Td>
                    <Td className="tabular subtle" style={{ fontSize: 12 }}>
                      {timeAgo(i.startedAt)}
                    </Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        title="编辑"
                        onClick={() => setDrawer({ kind: 'edit', id: i.id })}
                      >
                        <Icon d="edit" size={12} />
                      </IconButton>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
      </section>

      {/* Resolved */}
      <section>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <SectionH style={{ margin: 0 }}>已解决 · 近 30 天</SectionH>
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <Table>
            <thead>
              <tr>
                <Th>标题</Th>
                <Th style={{ width: 80 }}>影响</Th>
                <Th>受影响组件</Th>
                <Th style={{ width: 110 }}>持续</Th>
                <Th style={{ width: 140 }}>解决时间</Th>
              </tr>
            </thead>
            <tbody>
              {resolvedIncidents.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="subtle"
                    style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12 }}
                  >
                    暂无已解决事件
                  </td>
                </tr>
              ) : (
                resolvedIncidents.map((i) => (
                  <tr
                    key={i.id}
                    onClick={() => setDrawer({ kind: 'edit', id: i.id })}
                    style={{ cursor: 'pointer' }}
                  >
                    <Td>
                      <div className="row" style={{ gap: 6 }}>
                        <span style={{ fontWeight: 500 }}>{i.title}</span>
                        {i.source === 'auto' && (
                          <Badge tone="blue" style={{ fontSize: 9.5 }}>
                            自动
                          </Badge>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <ImpactBadge i={i.impact} />
                    </Td>
                    <Td className="subtle" style={{ fontSize: 12 }}>
                      {i.affected.length ? i.affected.map((c) => c.name).join('、') : '—'}
                    </Td>
                    <Td className="tabular subtle" style={{ fontSize: 12 }}>
                      {durationText(i.startedAt, i.resolvedAt)}
                    </Td>
                    <Td className="tabular subtle" style={{ fontSize: 12 }}>
                      {i.resolvedAt ? fmtTz(i.resolvedAt, siteTimezone, 'short') : '—'}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
        <Pagination page={resolvedPage} total={resolvedTotal} basePath="/admin/incidents" />
      </section>

      {/* Edit Sheet */}
      <Sheet
        open={drawer?.kind === 'edit' && editing != null}
        onClose={close}
        eyebrow="Editor"
        title={editing?.title ?? '事件'}
        footer={
          editing ? (
            <>
              <form style={{ display: 'inline' }}>
                <input type="hidden" name="id" value={editing.id} />
                <DangerButton size="md" type="submit" formAction={handleDelete}>
                  <Icon d="trash" size={12} /> 删除
                </DangerButton>
              </form>
              <div style={{ flex: 1 }} />
              <SecondaryButton size="md" onClick={close}>
                取消
              </SecondaryButton>
              <PrimaryButton size="md" type="submit" form={`incident-edit-form-${editing.id}`}>
                保存
              </PrimaryButton>
            </>
          ) : null
        }
      >
        {editing && (
          <>
            <div className="row" style={{ gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              <StatusBadge s={editing.status} />
              <ImpactBadge i={editing.impact} />
              {editing.source === 'auto' && <Badge tone="blue">自动事件</Badge>}
              <span className="subtle" style={{ fontSize: 12 }}>
                开始 {fmtTz(editing.startedAt, siteTimezone, 'datetime')}
              </span>
            </div>

            {/* key 随 updates 数量变化 —— 发布 update 后表单 remount,组件 grid
                 从最新 editing.affected 重新初始化,避免 stale-state 静默覆盖。 */}
            <form
              key={`incident-edit-form-${editing.id}-${editing.updates.length}`}
              id={`incident-edit-form-${editing.id}`}
              action={handleEdit}
              className="fade-in"
            >
              <input type="hidden" name="id" value={editing.id} />
              <Field label="标题">
                <TextInput name="title" defaultValue={editing.title} required />
              </Field>
              <Field label="影响等级">
                <select className="select" name="impact" defaultValue={editing.impact}>
                  {IMPACT_OPTIONS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="受影响组件" hint="可多选">
                <ComponentCheckboxGrid
                  configs={configs}
                  defaultSelected={new Set(editing.affected.map((a) => a.configId))}
                />
              </Field>
              <Field label="">
                <label className="row" style={{ gap: 8, fontSize: 13 }}>
                  <input type="checkbox" name="is_public" defaultChecked={editing.isPublic} />
                  <span>对外公开（在公共页显示）</span>
                </label>
              </Field>
            </form>

            <Divider />

            <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>更新时间线</h3>
            {/* key 随更新条数变化 —— 发布成功后表单自动重置（清空正文、回填默认值） */}
            <form
              key={`add-update-${editing.id}-${editing.updates.length}`}
              action={handleAddUpdate}
              style={{ marginBottom: 16 }}
            >
              <input type="hidden" name="incident_id" value={editing.id} />
              <Field
                label="添加更新"
                hint="正文支持 Markdown，含 GitHub 提示块（> [!NOTE] / [!WARNING]）"
              >
                <Textarea
                  name="body"
                  placeholder="发布给订阅者的更新…支持 Markdown"
                  rows={3}
                  required
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="状态">
                  <select className="select" name="status" defaultValue="monitoring">
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="影响等级">
                  <select className="select" name="impact" defaultValue={editing.impact}>
                    {IMPACT_OPTIONS.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="受影响组件" hint="本次更新发布时的受影响组件，将同步为事件当前关联组件">
                <ComponentCheckboxGrid
                  configs={configs}
                  defaultSelected={new Set(editing.affected.map((a) => a.configId))}
                />
              </Field>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <PrimaryButton type="submit">发布更新</PrimaryButton>
              </div>
            </form>

            {editing.updates.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {editing.updates.map((u, i) => {
                  const isEditingThis = editingUpdateId === u.id;
                  return (
                    <div
                      key={u.id ?? i}
                      style={{
                        position: 'relative',
                        paddingLeft: 18,
                        paddingBottom: 14,
                        borderLeft: '1px solid var(--border)',
                        marginLeft: 4,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: -5,
                          top: 4,
                          width: 9,
                          height: 9,
                          borderRadius: 999,
                          background: 'var(--brand)',
                          border: '2px solid var(--bg-elevated)',
                        }}
                      />
                      {isEditingThis ? (
                        <form action={handleEditUpdate}>
                          <input type="hidden" name="update_id" value={u.id} />
                          <Field label="">
                            <Textarea name="body" defaultValue={u.bodyMd} rows={3} required />
                          </Field>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: 12,
                            }}
                          >
                            <Field label="状态">
                              <select className="select" name="status" defaultValue={u.status}>
                                {STATUS_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field label="影响等级">
                              <select className="select" name="impact" defaultValue={u.impact}>
                                {IMPACT_OPTIONS.map((im) => (
                                  <option key={im} value={im}>
                                    {im}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          </div>
                          <Field label="受影响组件">
                            <ComponentCheckboxGrid
                              configs={configs}
                              defaultSelected={new Set(u.affected.map((a) => a.configId))}
                            />
                          </Field>
                          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                            <SecondaryButton onClick={() => setEditingUpdateId(null)}>
                              取消
                            </SecondaryButton>
                            <PrimaryButton type="submit">保存</PrimaryButton>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div
                            className="row"
                            style={{ gap: 6, marginBottom: 4, flexWrap: 'wrap' }}
                          >
                            <StatusBadge s={u.status} />
                            <ImpactBadge i={u.impact} />
                            <span className="subtle tabular" style={{ fontSize: 11 }}>
                              {fmtTz(u.createdAt, siteTimezone, 'datetime')}
                            </span>
                            <div style={{ flex: 1 }} />
                            <IconButton title="编辑" onClick={() => setEditingUpdateId(u.id)}>
                              <Icon d="edit" size={11} />
                            </IconButton>
                            <IconButton
                              title="删除"
                              tone="danger"
                              onClick={() => handleDeleteUpdate(u.id)}
                            >
                              <Icon d="trash" size={11} />
                            </IconButton>
                          </div>
                          {u.affected.length > 0 && (
                            <div className="subtle" style={{ fontSize: 11, marginBottom: 4 }}>
                              影响：{u.affected.map((a) => a.name).join('、')}
                            </div>
                          )}
                          <div style={{ fontSize: 12.5 }}>
                            <Markdown source={u.bodyMd} />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Sheet>

      {/* Create Sheet */}
      <Sheet
        open={drawer?.kind === 'create'}
        onClose={close}
        eyebrow="Editor"
        title="新建事件"
        footer={
          <>
            <SecondaryButton size="md" onClick={close}>
              取消
            </SecondaryButton>
            <PrimaryButton size="md" type="submit" form="incident-create-form">
              创建事件
            </PrimaryButton>
          </>
        }
      >
        <form id="incident-create-form" action={handleCreate} className="fade-in">
          <Field label="标题" hint="对外可见，例如 'GPT-4o 美西延迟升高'">
            <TextInput name="title" placeholder="简短描述" required />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="初始状态">
              <select className="select" name="status" defaultValue="investigating">
                {STATUS_OPTIONS.filter((s) => s !== 'resolved').map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="影响">
              <select className="select" name="impact" defaultValue="minor">
                {IMPACT_OPTIONS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="受影响组件">
            <ComponentCheckboxGrid configs={configs} />
          </Field>
          <Field label="第一条更新（可选）" hint="将作为时间线第一条，支持 Markdown">
            <Textarea name="first_update" placeholder="将作为时间线第一条…支持 Markdown" rows={3} />
          </Field>
          <Field label="">
            <label className="row" style={{ gap: 8, fontSize: 13 }}>
              <input type="checkbox" name="is_public" defaultChecked />
              <span>对外公开（在公共页显示）</span>
            </label>
          </Field>
        </form>
      </Sheet>

      {/* Batch Edit Sheet */}
      <Sheet
        open={drawer?.kind === 'batch'}
        onClose={close}
        eyebrow="Editor"
        title={`批量编辑 ${selectedIds.length} 个事件`}
        footer={
          <>
            <SecondaryButton size="md" onClick={close}>
              取消
            </SecondaryButton>
            <PrimaryButton size="md" type="submit" form="incident-batch-form">
              应用
            </PrimaryButton>
          </>
        }
      >
        <form id="incident-batch-form" action={handleBulkEdit} className="fade-in">
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="selected" value={id} />
          ))}
          <p className="subtle" style={{ fontSize: 12, marginBottom: 14 }}>
            仅修改下方被设置的字段，「不修改」项保持原值。
          </p>
          <Field label="状态">
            <select className="select" name="status" defaultValue="">
              <option value="">— 不修改 —</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="影响等级">
            <select className="select" name="impact" defaultValue="">
              <option value="">— 不修改 —</option>
              {IMPACT_OPTIONS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </Field>
          <Field label="对外公开">
            <select className="select" name="is_public" defaultValue="">
              <option value="">— 不修改 —</option>
              <option value="true">公开</option>
              <option value="false">不公开</option>
            </select>
          </Field>
        </form>
      </Sheet>

      <Toast toast={toast} />
    </>
  );
}

function ComponentCheckboxGrid({
  configs,
  defaultSelected,
}: {
  configs: ConfigOption[];
  defaultSelected?: Set<number>;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(defaultSelected ? Array.from(defaultSelected) : []),
  );
  if (configs.length === 0) {
    return <p className="subtle text-xs">尚无可选组件</p>;
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 6,
        padding: 10,
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        borderRadius: 6,
      }}
    >
      {configs.map((c) => {
        const checked = selected.has(c.id);
        return (
          <label
            key={c.id}
            className="row"
            style={{ gap: 8, fontSize: 12.5, cursor: 'pointer', padding: '4px 6px' }}
          >
            <StyledCheckbox
              checked={checked}
              onChange={(v) => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (v) next.add(c.id);
                  else next.delete(c.id);
                  return next;
                });
              }}
              name="component_ids"
              value={c.id}
              ariaLabel={c.name}
            />
            {c.name}
          </label>
        );
      })}
    </div>
  );
}
