'use client';

import { useState } from 'react';
import {
  Badge,
  DangerButton,
  Field,
  GhostButton,
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
import { Sheet } from '@/components/ui/sheet';
import { Toast, useDrawerActions } from '@/components/admin/use-drawer-actions';
import { DateTimeLocalInput } from '@/components/admin/date-time-local-input';
import { fmtTz } from '@/lib/timezone';

import { LEVEL_OPTIONS, type AnnLevel } from './admin-shared';
export { LEVEL_OPTIONS };
export type { AnnLevel };

export interface AnnouncementRow {
  id: number;
  bodyMd: string;
  level: AnnLevel;
  startsAt: string;
  endsAt: string | null;
  enabled: boolean;
}

interface Props {
  active: AnnouncementRow[];
  inactive: AnnouncementRow[];
  inactiveTotal: number;
  inactivePage: number;
  siteTimezone: string;
  createAnnouncement: (formData: FormData) => Promise<void>;
  editAnnouncement: (formData: FormData) => Promise<void>;
  toggleEnabled: (id: number) => Promise<void>;
  deleteAnnouncement: (id: number) => Promise<void>;
}

type DrawerMode = { kind: 'create' } | { kind: 'edit'; row: AnnouncementRow } | null;

function toDatetimeLocalUtc(d: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 16);
}

function levelTone(level: AnnLevel): 'blue' | 'amber' | 'rose' {
  if (level === 'error') return 'rose';
  if (level === 'warning') return 'amber';
  return 'blue';
}

export function AnnouncementsTable({
  active,
  inactive,
  inactiveTotal,
  inactivePage,
  siteTimezone,
  createAnnouncement,
  editAnnouncement,
  toggleEnabled,
  deleteAnnouncement,
}: Props) {
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const close = () => setDrawer(null);
  const editing = drawer?.kind === 'edit' ? drawer.row : null;
  const { toast, run } = useDrawerActions();

  const handleCreate = async (fd: FormData): Promise<void> => {
    run(() => createAnnouncement(fd), close, { okText: '已创建' });
  };
  const handleEdit = async (fd: FormData): Promise<void> => {
    run(() => editAnnouncement(fd), close, { okText: '已保存' });
  };
  const handleDelete = (id: number) => {
    run(() => deleteAnnouncement(id), close, { okText: '已删除' });
  };
  const handleToggle = (id: number) => {
    run(() => toggleEnabled(id), undefined, { okText: '已更新' });
  };

  return (
    <>
      <PageHeader
        title="公告"
        description="站顶横幅。常用于发布博客、新功能或限时通知。"
        actions={
          <PrimaryButton size="md" onClick={() => setDrawer({ kind: 'create' })}>
            <Icon d="plus" size={13} /> 新建公告
          </PrimaryButton>
        }
      />

      {/* Active */}
      <section style={{ marginBottom: 24 }}>
        <SectionH>生效中 · {active.length}</SectionH>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {active.length === 0 ? (
            <div className="card subtle" style={{ padding: 16, fontSize: 12, textAlign: 'center' }}>
              当前无生效中公告
            </div>
          ) : (
            active.map((a) => (
              <div key={a.id} className="card lift" style={{ padding: 16 }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <Badge tone={levelTone(a.level)}>{a.level}</Badge>
                    <Badge tone="green">已启用</Badge>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <GhostButton onClick={() => setDrawer({ kind: 'edit', row: a })}>
                      <Icon d="edit" size={12} /> 编辑
                    </GhostButton>
                    <GhostButton onClick={() => handleToggle(a.id)}>禁用</GhostButton>
                    <IconButton tone="danger" onClick={() => handleDelete(a.id)} title="删除">
                      <Icon d="trash" size={12} />
                    </IconButton>
                  </div>
                </div>
                <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {a.bodyMd}
                </div>
                <div className="subtle tabular" style={{ fontSize: 11, marginTop: 8 }}>
                  开始 {fmtTz(a.startsAt, siteTimezone, 'short')} ·{' '}
                  {a.endsAt ? `结束 ${fmtTz(a.endsAt, siteTimezone, 'short')}` : '无结束时间'}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Inactive */}
      <section>
        <SectionH>已禁用 / 已过期</SectionH>
        <div className="card" style={{ overflow: 'hidden' }}>
          <Table>
            <thead>
              <tr>
                <Th>内容</Th>
                <Th style={{ width: 80 }}>级别</Th>
                <Th style={{ width: 100 }}>状态</Th>
                <Th style={{ width: 160 }}>有效期</Th>
                <Th style={{ width: 100 }}>{''}</Th>
              </tr>
            </thead>
            <tbody>
              {inactive.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="subtle"
                    style={{ padding: '32px 14px', textAlign: 'center', fontSize: 12 }}
                  >
                    无
                  </td>
                </tr>
              ) : (
                inactive.map((a) => {
                  const expired = a.endsAt != null && new Date(a.endsAt).getTime() <= Date.now();
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setDrawer({ kind: 'edit', row: a })}
                      style={{ cursor: 'pointer' }}
                    >
                      <Td>
                        <span style={{ fontSize: 13 }}>{a.bodyMd}</span>
                      </Td>
                      <Td>
                        <Badge tone={levelTone(a.level)}>{a.level}</Badge>
                      </Td>
                      <Td>
                        <Badge>{expired ? '已过期' : a.enabled ? '已启用' : '已禁用'}</Badge>
                      </Td>
                      <Td className="tabular subtle" style={{ fontSize: 11.5 }}>
                        {fmtTz(a.startsAt, siteTimezone, 'short')} →{' '}
                        {a.endsAt ? fmtTz(a.endsAt, siteTimezone, 'short') : '∞'}
                      </Td>
                      <Td onClick={(e) => e.stopPropagation()}>
                        <div className="row" style={{ gap: 4 }}>
                          <GhostButton onClick={() => handleToggle(a.id)}>
                            {a.enabled ? '禁用' : '启用'}
                          </GhostButton>
                          <IconButton tone="danger" onClick={() => handleDelete(a.id)} title="删除">
                            <Icon d="trash" size={12} />
                          </IconButton>
                        </div>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </div>
        <Pagination page={inactivePage} total={inactiveTotal} basePath="/admin/announcements" />
      </section>

      {/* Edit Sheet */}
      <Sheet
        open={drawer?.kind === 'edit'}
        onClose={close}
        eyebrow="Editor"
        title={editing ? `编辑公告 #${editing.id}` : '公告'}
        footer={
          editing ? (
            <>
              <DangerButton size="md" onClick={() => handleDelete(editing.id)}>
                <Icon d="trash" size={12} /> 删除
              </DangerButton>
              <div style={{ flex: 1 }} />
              <SecondaryButton size="md" onClick={close}>
                取消
              </SecondaryButton>
              <PrimaryButton size="md" type="submit" form={`ann-edit-form-${editing.id}`}>
                保存
              </PrimaryButton>
            </>
          ) : null
        }
      >
        {editing && (
          <form id={`ann-edit-form-${editing.id}`} action={handleEdit} className="fade-in">
            <input type="hidden" name="id" value={editing.id} />
            <Field label="内容" hint="支持换行；不渲染 Markdown 语法">
              <Textarea name="body_md" defaultValue={editing.bodyMd} rows={5} required />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="级别">
                <select className="select" name="level" defaultValue={editing.level}>
                  {LEVEL_OPTIONS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="启用">
                <label className="row" style={{ gap: 8, fontSize: 13, paddingTop: 6 }}>
                  <input type="checkbox" name="enabled" defaultChecked={editing.enabled} />
                  <span>{editing.enabled ? '是' : '否'}</span>
                </label>
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="开始时间" hint="按站点时区输入,留空则立即生效">
                <DateTimeLocalInput
                  name="starts_at"
                  defaultValue={editing.startsAt}
                  siteTimezone={siteTimezone}
                />
              </Field>
              <Field label="结束时间" hint="按站点时区输入,留空表示长期有效">
                <DateTimeLocalInput
                  name="ends_at"
                  defaultValue={editing.endsAt}
                  siteTimezone={siteTimezone}
                />
              </Field>
            </div>
            <div className="subtle tabular" style={{ fontSize: 11, marginTop: 8 }}>
              开始 {fmtTz(editing.startsAt, siteTimezone, 'datetime')} ·{' '}
              {editing.endsAt
                ? `结束 ${fmtTz(editing.endsAt, siteTimezone, 'datetime')}`
                : '无结束时间'}
            </div>
          </form>
        )}
      </Sheet>

      {/* Create Sheet */}
      <Sheet
        open={drawer?.kind === 'create'}
        onClose={close}
        eyebrow="Editor"
        title="新建公告"
        footer={
          <>
            <SecondaryButton size="md" onClick={close}>
              取消
            </SecondaryButton>
            <PrimaryButton size="md" type="submit" form="ann-create-form">
              创建
            </PrimaryButton>
          </>
        }
      >
        <form id="ann-create-form" action={handleCreate} className="fade-in">
          <Field label="内容" hint="支持换行；不渲染 Markdown 语法">
            <Textarea name="body_md" rows={5} required placeholder="🎉 服务版本已升级…" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="级别">
              <select className="select" name="level" defaultValue="info">
                {LEVEL_OPTIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="启用">
              <label className="row" style={{ gap: 8, fontSize: 13, paddingTop: 6 }}>
                <input type="checkbox" name="enabled" defaultChecked />
                <span>勾选即立刻启用</span>
              </label>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="开始时间" hint="按站点时区输入,留空则立即生效">
              <DateTimeLocalInput name="starts_at" siteTimezone={siteTimezone} />
            </Field>
            <Field label="结束时间" hint="按站点时区输入,留空表示长期有效">
              <DateTimeLocalInput name="ends_at" siteTimezone={siteTimezone} />
            </Field>
          </div>
        </form>
      </Sheet>

      <Toast toast={toast} />
    </>
  );
}
