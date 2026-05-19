'use client';

import { useState } from 'react';
import {
  Badge,
  DangerButton,
  Field,
  IconButton,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Table,
  Td,
  TextInput,
  Textarea,
  Th,
} from '@/components/admin/forms';
import { DateTimeLocalInput } from '@/components/admin/date-time-local-input';
import { Icon } from '@/components/admin/icon';
import { Pagination } from '@/components/admin/pagination';
import { StyledCheckbox } from '@/components/admin/styled-checkbox';
import { Sheet } from '@/components/ui/sheet';
import { Toast, useDrawerActions } from '@/components/admin/use-drawer-actions';

import { MAINT_STATUS_OPTIONS as STATUS_OPTIONS, type MaintStatus } from './admin-shared';
export { STATUS_OPTIONS };
export type { MaintStatus };

const STATUS_MAP: Record<
  MaintStatus,
  { tone: 'neutral' | 'blue' | 'green' | 'rose'; label: string }
> = {
  scheduled: { tone: 'neutral', label: '已计划' },
  in_progress: { tone: 'blue', label: '进行中' },
  completed: { tone: 'green', label: '已完成' },
  cancelled: { tone: 'rose', label: '已取消' },
};

function StatusBadge({ s }: { s: MaintStatus }) {
  const m = STATUS_MAP[s];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export interface MaintRow {
  id: number;
  title: string;
  bodyMd: string | null;
  status: MaintStatus;
  scheduledStart: string | Date;
  scheduledEnd: string | Date;
  notifyLeadMinutes: number;
  affected: Array<{ configId: number; name: string }>;
}

export interface ConfigOption {
  id: number;
  name: string;
}

interface Props {
  upcoming: MaintRow[];
  past: MaintRow[];
  pastTotal: number;
  pastPage: number;
  configs: ConfigOption[];
  siteTimezone: string;
  createMaint: (formData: FormData) => Promise<void>;
  editMaint: (formData: FormData) => Promise<void>;
  setStatus: (formData: FormData) => Promise<void>;
  deleteMaint: (formData: FormData) => Promise<void>;
}

type DrawerMode = { kind: 'create' } | { kind: 'edit'; row: MaintRow } | null;

import { fmtRangeTz } from '@/lib/timezone';

/** 维护时间按站点时区展示 —— 与 DateTimeLocalInput 输入侧解释保持一致。
    Intl 显式指定 timeZone,server 与 client 输出相同,无需 suppressHydrationWarning。 */
function fmtRange(s: Date | string, e: Date | string, tz: string): string {
  return fmtRangeTz(s, e, tz);
}

export function MaintenancesTable({
  upcoming,
  past,
  pastTotal,
  pastPage,
  configs,
  siteTimezone,
  createMaint,
  editMaint,
  setStatus,
  deleteMaint,
}: Props) {
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const close = () => setDrawer(null);
  const editing = drawer?.kind === 'edit' ? drawer.row : null;
  const { toast, run } = useDrawerActions();

  const handleCreate = async (fd: FormData): Promise<void> => {
    run(() => createMaint(fd), close, { okText: '已创建' });
  };
  const handleEdit = async (fd: FormData): Promise<void> => {
    run(() => editMaint(fd), close, { okText: '已保存' });
  };
  const handleDelete = async (fd: FormData): Promise<void> => {
    run(() => deleteMaint(fd), close, { okText: '已删除' });
  };
  const handleSetStatus = async (fd: FormData): Promise<void> => {
    run(() => setStatus(fd), undefined, { okText: '状态已更新' });
  };

  return (
    <>
      <PageHeader
        title="维护"
        description="计划维护窗口，到达开始时间将自动联动组件状态。"
        actions={
          <PrimaryButton size="md" onClick={() => setDrawer({ kind: 'create' })}>
            <Icon d="plus" size={13} /> 新建维护
          </PrimaryButton>
        }
      />

      <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
        <Table>
          <thead>
            <tr>
              <Th>标题</Th>
              <Th style={{ width: 100 }}>状态</Th>
              <Th>受影响</Th>
              <Th style={{ width: 240 }}>窗口</Th>
              <Th style={{ width: 100 }}>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {upcoming.length === 0 && past.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="subtle"
                  style={{ padding: '32px 14px', textAlign: 'center', fontSize: 12 }}
                >
                  暂无维护
                </td>
              </tr>
            ) : (
              [...upcoming, ...past].map((m) => (
                <tr
                  key={m.id}
                  onClick={() => setDrawer({ kind: 'edit', row: m })}
                  style={{ cursor: 'pointer' }}
                >
                  <Td>
                    <div style={{ fontWeight: 500 }}>{m.title}</div>
                    {m.bodyMd && (
                      <div className="subtle" style={{ fontSize: 11.5, marginTop: 2 }}>
                        {m.bodyMd}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge s={m.status} />
                  </Td>
                  <Td className="subtle" style={{ fontSize: 12 }}>
                    {m.affected.length > 0 ? m.affected.map((c) => c.name).join('、') : '—'}
                  </Td>
                  <Td className="tabular subtle" style={{ fontSize: 12 }}>
                    {fmtRange(m.scheduledStart, m.scheduledEnd, siteTimezone)}
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {m.status === 'scheduled' && (
                      <form style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="status" value="in_progress" />
                        <SecondaryButton type="submit" formAction={handleSetStatus}>
                          开始
                        </SecondaryButton>
                      </form>
                    )}
                    {m.status === 'in_progress' && (
                      <form style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="status" value="completed" />
                        <SecondaryButton type="submit" formAction={handleSetStatus}>
                          完成
                        </SecondaryButton>
                      </form>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>

      {pastTotal > 0 && (
        <Pagination page={pastPage} total={pastTotal} basePath="/admin/maintenances" />
      )}

      {/* Edit Sheet */}
      <Sheet
        open={drawer?.kind === 'edit'}
        onClose={close}
        eyebrow="Editor"
        title={editing?.title ?? '维护'}
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
              <PrimaryButton size="md" type="submit" form={`maint-edit-form-${editing.id}`}>
                保存
              </PrimaryButton>
            </>
          ) : null
        }
      >
        {editing && (
          <form id={`maint-edit-form-${editing.id}`} action={handleEdit} className="fade-in">
            <input type="hidden" name="id" value={editing.id} />
            <Field label="标题">
              <TextInput name="title" defaultValue={editing.title} required />
            </Field>
            <Field label="状态">
              <StatusBadge s={editing.status} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="计划开始" hint="按站点时区输入,提交时转为 UTC 存储">
                <DateTimeLocalInput
                  name="scheduled_start"
                  defaultValue={editing.scheduledStart}
                  required
                  siteTimezone={siteTimezone}
                />
              </Field>
              <Field label="计划结束">
                <DateTimeLocalInput
                  name="scheduled_end"
                  defaultValue={editing.scheduledEnd}
                  required
                  siteTimezone={siteTimezone}
                />
              </Field>
            </div>
            <Field label="提前广播分钟" hint="到点前 N 分钟开始展示提示">
              <TextInput
                name="notify_lead_minutes"
                type="number"
                defaultValue={editing.notifyLeadMinutes}
                min={0}
                className="tabular"
              />
            </Field>
            <Field label="说明">
              <Textarea name="body_md" defaultValue={editing.bodyMd ?? ''} rows={3} />
            </Field>
            <Field label="受影响组件">
              <ComponentCheckboxGrid
                configs={configs}
                defaultSelected={new Set(editing.affected.map((a) => a.configId))}
              />
            </Field>
          </form>
        )}
      </Sheet>

      {/* Create Sheet */}
      <Sheet
        open={drawer?.kind === 'create'}
        onClose={close}
        eyebrow="Editor"
        title="新建维护"
        footer={
          <>
            <SecondaryButton size="md" onClick={close}>
              取消
            </SecondaryButton>
            <PrimaryButton size="md" type="submit" form="maint-create-form">
              创建
            </PrimaryButton>
          </>
        }
      >
        <form id="maint-create-form" action={handleCreate} className="fade-in">
          <Field label="标题">
            <TextInput name="title" placeholder="例：Gemini 1.5 Pro 升级窗口" required />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="计划开始" hint="按站点时区输入,提交时转为 UTC 存储">
              <DateTimeLocalInput name="scheduled_start" required siteTimezone={siteTimezone} />
            </Field>
            <Field label="计划结束">
              <DateTimeLocalInput name="scheduled_end" required siteTimezone={siteTimezone} />
            </Field>
          </div>
          <Field label="提前广播分钟" hint="到点前 N 分钟开始展示提示，默认 60 分钟">
            <TextInput
              name="notify_lead_minutes"
              type="number"
              defaultValue={60}
              min={0}
              className="tabular"
            />
          </Field>
          <Field label="说明（可选）">
            <Textarea name="body_md" rows={3} placeholder="升级原因 / 影响范围 / 用户须知…" />
          </Field>
          <Field label="受影响组件（可多选）">
            <ComponentCheckboxGrid configs={configs} />
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
