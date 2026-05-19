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
  Table,
  Td,
  TextInput,
  Th,
} from '@/components/admin/forms';
import { Icon } from '@/components/admin/icon';
import { ProviderMark } from '@/components/admin/provider-mark';
import { StyledCheckbox } from '@/components/admin/styled-checkbox';
import {
  OFFICIAL_STATUS_COLOR,
  OFFICIAL_STATUS_LABEL,
  type FeedKind,
  type OfficialOverallStatus,
} from '@/lib/api/official-status-shared';
import { Sheet } from '@/components/ui/sheet';
import { Toast, useDrawerActions } from '@/components/admin/use-drawer-actions';
import { fmtTz } from '@/lib/timezone';

export type { FeedKind };

export interface MirrorTableRow {
  id: number;
  name: string;
  statusUrl: string;
  homepage: string | null;
  providerId: number | null;
  providerType: string | null;
  feedKind: FeedKind;
  feedUrl: string | null;
  syncIntervalSeconds: number;
  enabled: boolean;
  sortOrder: number;
  latestStatus: OfficialOverallStatus | null;
  latestDescription: string | null;
  latestFetchedAt: string | null;
  snapshotsLast24h: number;
  snapshotsTotal: number;
  hourly24: Array<string | null>;
  upstreamActiveCount: number;
}

export interface ProviderOption {
  id: number;
  name: string;
  type: string;
}

interface Props {
  rows: MirrorTableRow[];
  providers: ProviderOption[];
  siteTimezone: string;
  createMirror: (formData: FormData) => Promise<void>;
  editMirror: (formData: FormData) => Promise<void>;
  deleteMirror: (id: number) => Promise<void>;
  refreshOne: (id: number) => Promise<void>;
  refreshAll: () => Promise<void>;
}

type DrawerMode = { kind: 'create' } | { kind: 'edit'; row: MirrorTableRow } | null;

function timeAgo(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  const s = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

function fmtUTC(d: string | null, tz: string): string {
  if (!d) return '—';
  return fmtTz(d, tz, 'datetime');
}

function StatusBadge({ s }: { s: OfficialOverallStatus | null }) {
  if (!s) return <Badge>未知</Badge>;
  const color = OFFICIAL_STATUS_COLOR[s];
  return (
    <span className="row" style={{ gap: 6 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          display: 'inline-block',
        }}
        aria-hidden
      />
      <span style={{ fontSize: 12 }}>{OFFICIAL_STATUS_LABEL[s]}</span>
    </span>
  );
}

function HourlyStrip({ hourly }: { hourly: Array<string | null> }) {
  if (hourly.length === 0) {
    return (
      <span className="subtle" style={{ fontSize: 11 }}>
        —
      </span>
    );
  }
  return (
    <div className="bar-strip bar-strip-static" style={{ display: 'flex', gap: 1, height: 14 }}>
      {hourly.map((s, i) => {
        const color = s
          ? (OFFICIAL_STATUS_COLOR[s as OfficialOverallStatus] ?? 'var(--fg-muted)')
          : 'var(--bg-muted)';
        return (
          <div
            key={i}
            style={{
              flex: 1,
              background: color,
              opacity: s ? 0.85 : 0.4,
              borderRadius: 1.5,
            }}
            title={
              s
                ? `${24 - i}h 前 — ${OFFICIAL_STATUS_LABEL[s as OfficialOverallStatus] ?? s}`
                : `${24 - i}h 前 — 无数据`
            }
          />
        );
      })}
    </div>
  );
}

export function OfficialStatusMirrorsTable({
  rows,
  providers,
  siteTimezone,
  createMirror,
  editMirror,
  deleteMirror,
  refreshOne,
  refreshAll,
}: Props) {
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const close = () => setDrawer(null);
  const editing = drawer?.kind === 'edit' ? drawer.row : null;
  const { toast, run } = useDrawerActions();

  const handleCreate = async (fd: FormData): Promise<void> => {
    run(() => createMirror(fd), close, { okText: '已创建' });
  };
  const handleEdit = async (fd: FormData): Promise<void> => {
    run(() => editMirror(fd), close, { okText: '已保存' });
  };
  const handleDelete = (id: number) => {
    run(() => deleteMirror(id), close, { okText: '已删除' });
  };
  const handleRefreshOne = (id: number) => {
    run(() => refreshOne(id), undefined, { okText: '已抓取' });
  };
  const handleRefreshAll = async (): Promise<void> => {
    run(() => refreshAll(), undefined, { okText: '已触发批量抓取' });
  };

  return (
    <>
      <PageHeader
        title="官方状态镜像"
        description="拉取各 Provider 公开 statuspage.io 兼容的快照，公共页 /official-status 与之保持一致。"
        actions={
          <>
            <SecondaryButton size="md" onClick={handleRefreshAll}>
              <Icon d="refresh" size={13} /> 立即刷新全部
            </SecondaryButton>
            <PrimaryButton size="md" onClick={() => setDrawer({ kind: 'create' })}>
              <Icon d="plus" size={13} /> 添加镜像源
            </PrimaryButton>
          </>
        }
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        <Table>
          <thead>
            <tr>
              <Th>Provider</Th>
              <Th style={{ width: 80 }}>类型</Th>
              <Th style={{ width: 130 }}>状态</Th>
              <Th style={{ width: 180 }}>最近 24 小时</Th>
              <Th style={{ width: 110 }}>抓取间隔</Th>
              <Th style={{ width: 130 }}>最后抓取</Th>
              <Th style={{ width: 90 }}>快照数</Th>
              <Th style={{ width: 80 }}>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="subtle"
                  style={{ padding: '32px 14px', textAlign: 'center', fontSize: 12 }}
                >
                  尚无镜像，点击右上角「添加镜像源」
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setDrawer({ kind: 'edit', row: p })}
                  style={{ cursor: 'pointer' }}
                >
                  <Td>
                    <div className="row" style={{ gap: 10 }}>
                      <ProviderMark type={p.providerType ?? 'custom'} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                        <a
                          href={p.statusUrl}
                          className="subtle mono"
                          style={{
                            fontSize: 11,
                            maxWidth: 280,
                            display: 'inline-block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.statusUrl}
                        </a>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                      <Badge className="mono" style={{ fontSize: 10 }}>
                        {p.providerType ?? '独立'}
                      </Badge>
                      <Badge className="mono" style={{ fontSize: 10 }}>
                        {p.feedKind}
                      </Badge>
                      {p.upstreamActiveCount > 0 && (
                        <Badge tone="rose" style={{ fontSize: 10 }}>
                          {p.upstreamActiveCount} 事件
                        </Badge>
                      )}
                    </div>
                  </Td>
                  <Td>{p.enabled ? <StatusBadge s={p.latestStatus} /> : <Badge>已停用</Badge>}</Td>
                  <Td>
                    <HourlyStrip hourly={p.hourly24} />
                  </Td>
                  <Td className="tabular" style={{ fontSize: 12 }}>
                    {p.syncIntervalSeconds}s
                  </Td>
                  <Td className="tabular subtle" style={{ fontSize: 11.5 }}>
                    {timeAgo(p.latestFetchedAt)}
                  </Td>
                  <Td className="tabular subtle" style={{ fontSize: 12 }}>
                    {p.snapshotsTotal.toLocaleString()}
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <div className="row" style={{ gap: 4 }}>
                      <IconButton title="立即抓取" onClick={() => handleRefreshOne(p.id)}>
                        <Icon d="refresh" size={12} />
                      </IconButton>
                      <IconButton title="编辑" onClick={() => setDrawer({ kind: 'edit', row: p })}>
                        <Icon d="edit" size={12} />
                      </IconButton>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 18, background: 'var(--bg-subtle)' }}>
        <div className="row" style={{ gap: 10 }}>
          <span style={{ color: 'var(--brand)', fontSize: 16 }}>ℹ</span>
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
            镜像源在本页直接管理。每个镜像源可关联一个 Provider（仅用于显示与归属），并通过其
            statusUrl 拉取 statuspage.io 兼容的 JSON 快照。
          </div>
        </div>
      </div>

      {/* Edit Sheet */}
      <Sheet
        open={drawer?.kind === 'edit'}
        onClose={close}
        eyebrow="Editor"
        title={editing?.name ?? '镜像源'}
        footer={
          editing ? (
            <>
              <DangerButton size="md" onClick={() => handleDelete(editing.id)}>
                <Icon d="trash" size={12} /> 删除
              </DangerButton>
              <div style={{ flex: 1 }} />
              <SecondaryButton size="md" onClick={() => handleRefreshOne(editing.id)}>
                <Icon d="refresh" size={12} /> 立即抓取
              </SecondaryButton>
              <SecondaryButton size="md" onClick={close}>
                取消
              </SecondaryButton>
              <PrimaryButton size="md" type="submit" form={`mirror-edit-form-${editing.id}`}>
                保存
              </PrimaryButton>
            </>
          ) : null
        }
      >
        {editing && (
          <>
            <div className="row" style={{ gap: 10, marginBottom: 18 }}>
              <ProviderMark type={editing.providerType ?? 'custom'} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{editing.name}</div>
                <div className="subtle" style={{ fontSize: 12 }}>
                  已快照 {editing.snapshotsTotal.toLocaleString()} 次 · 最近{' '}
                  {timeAgo(editing.latestFetchedAt)}
                </div>
              </div>
              {editing.enabled ? <StatusBadge s={editing.latestStatus} /> : <Badge>已停用</Badge>}
            </div>

            <form id={`mirror-edit-form-${editing.id}`} action={handleEdit} className="fade-in">
              <input type="hidden" name="id" value={editing.id} />

              <Field label="关联 Provider" hint="决定公共页 /official-status 中此卡片的归属与图标">
                <select
                  className="select"
                  name="provider_id"
                  defaultValue={editing.providerId ?? ''}
                >
                  <option value="">— 不绑定（独立镜像源） —</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="显示名称">
                <TextInput name="name" defaultValue={editing.name} required />
              </Field>

              <Field
                label="状态页 URL"
                hint="供前端展示 / 后台跳转；若数据源是 statuspage.io 兼容，将自动追加 /api/v2/summary.json"
              >
                <TextInput
                  name="status_url"
                  defaultValue={editing.statusUrl}
                  className="mono"
                  required
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
                <Field label="数据源种类">
                  <select className="select" name="feed_kind" defaultValue={editing.feedKind}>
                    <option value="statuspage_v2">statuspage.io v2</option>
                    <option value="rss">RSS</option>
                    <option value="atom">Atom</option>
                  </select>
                </Field>
                <Field label="Feed URL（可选，统一规则：留空则复用状态页 URL）">
                  <TextInput
                    name="feed_url"
                    defaultValue={editing.feedUrl ?? ''}
                    className="mono"
                    placeholder="https://status.example.com/history.rss"
                  />
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="抓取间隔（秒）" hint="60 ~ 3600">
                  <TextInput
                    name="sync_interval_seconds"
                    type="number"
                    defaultValue={editing.syncIntervalSeconds}
                    min={60}
                    max={3600}
                    className="tabular"
                  />
                </Field>
                <Field label="启用抓取">
                  <EnabledToggle defaultChecked={editing.enabled} />
                </Field>
              </div>

              <Field label="官网 URL">
                <TextInput name="homepage" defaultValue={editing.homepage ?? ''} />
              </Field>

              <Field label="排序">
                <TextInput
                  name="sort_order"
                  type="number"
                  defaultValue={editing.sortOrder}
                  className="tabular"
                />
              </Field>
            </form>

            <Divider />
            <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>当前快照预览</h3>
            <div
              className="card"
              style={{ padding: 12, background: 'var(--bg-subtle)', fontSize: 12 }}
            >
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span
                  className="subtle"
                  style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}
                >
                  当前状态
                </span>
                <StatusBadge s={editing.latestStatus} />
              </div>
              {editing.latestDescription && (
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span
                    className="subtle"
                    style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    状态描述
                  </span>
                  <span style={{ fontSize: 12.5 }}>{editing.latestDescription}</span>
                </div>
              )}
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span
                  className="subtle"
                  style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}
                >
                  上次抓取
                </span>
                <span className="tabular" style={{ fontSize: 12 }}>
                  {fmtUTC(editing.latestFetchedAt, siteTimezone)}
                </span>
              </div>
            </div>
          </>
        )}
      </Sheet>

      {/* Create Sheet */}
      <Sheet
        open={drawer?.kind === 'create'}
        onClose={close}
        eyebrow="Editor"
        title="添加镜像源"
        footer={
          <>
            <SecondaryButton size="md" onClick={close}>
              取消
            </SecondaryButton>
            <PrimaryButton size="md" type="submit" form="mirror-create-form">
              创建
            </PrimaryButton>
          </>
        }
      >
        <form id="mirror-create-form" action={handleCreate} className="fade-in">
          <Field label="关联 Provider" hint="可选；用于显示 ProviderMark 与归属">
            <select className="select" name="provider_id" defaultValue="">
              <option value="">— 不绑定（独立镜像源） —</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="显示名称">
            <TextInput name="name" placeholder="例：Cohere" required />
          </Field>
          <Field
            label="状态页 URL"
            hint="供前端跳转；若数据源是 statuspage.io 兼容，将自动追加 /api/v2/summary.json"
          >
            <TextInput
              name="status_url"
              className="mono"
              placeholder="https://status.example.com"
              list="status-page-urls"
              required
            />
            <datalist id="status-page-urls">
              <option value="https://status.openai.com" />
              <option value="https://status.anthropic.com" />
              <option value="https://status.cloud.google.com" />
              <option value="https://status.x.ai" />
              <option value="https://status.deepseek.com" />
              <option value="https://status.cohere.com" />
              <option value="https://status.mistral.ai" />
            </datalist>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
            <Field label="数据源种类">
              <select className="select" name="feed_kind" defaultValue="statuspage_v2">
                <option value="statuspage_v2">statuspage.io v2</option>
                <option value="rss">RSS</option>
                <option value="atom">Atom</option>
              </select>
            </Field>
            <Field label="Feed URL（可选）" hint="留空则复用状态页 URL；RSS/Atom 模式建议显式填写">
              <TextInput
                name="feed_url"
                className="mono"
                placeholder="https://status.example.com/history.rss"
              />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="抓取间隔（秒）" hint="60 ~ 3600，默认 300">
              <TextInput
                name="sync_interval_seconds"
                type="number"
                defaultValue={300}
                min={60}
                max={3600}
                className="tabular"
              />
            </Field>
            <Field label="排序">
              <TextInput name="sort_order" type="number" defaultValue={0} className="tabular" />
            </Field>
          </div>
          <Field label="官网 URL">
            <TextInput name="homepage" />
          </Field>
        </form>
      </Sheet>

      <Toast toast={toast} />
    </>
  );
}

function EnabledToggle({ defaultChecked }: { defaultChecked: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label className="row" style={{ gap: 8, fontSize: 13, paddingTop: 6, cursor: 'pointer' }}>
      <StyledCheckbox
        checked={checked}
        onChange={setChecked}
        name="enabled"
        value="on"
        ariaLabel="启用抓取"
      />
      <span>{checked ? '正在定时抓取' : '已暂停'}</span>
    </label>
  );
}
