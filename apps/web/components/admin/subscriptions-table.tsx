'use client';

import { useState } from 'react';
import { SUBSCRIPTION_EVENTS } from '@/components/admin/admin-shared';
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
import { fmtTz } from '@/lib/timezone';
import { Icon } from '@/components/admin/icon';
import { StatCard } from '@/components/admin/stat-card';
import { StyledCheckbox } from '@/components/admin/styled-checkbox';
import { Sheet } from '@/components/ui/sheet';
import { Toast, useDrawerActions } from '@/components/admin/use-drawer-actions';

export interface SubscriptionRow {
  id: number;
  label: string | null;
  target: string;
  /** 服务端派生的末 4 位掩码,明文 secret 从不传到客户端。 */
  secretMask: string | null;
  hasSecret: boolean;
  channel: string;
  createdAt: string;
  eventCount: number;
  status: 'active' | 'failing' | 'unverified';
}

export interface DeliveryRow {
  id: number;
  subscriptionId: number;
  subscriptionLabel: string | null;
  eventType: string;
  status: 'pending' | 'delivered' | 'failed';
  httpStatus: number | null;
  attempts: number;
  durationMs: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface WebhookKpis {
  total: number;
  failing: number;
  deliveriesLast24h: number;
  failRate: number;
}

interface Props {
  subs: SubscriptionRow[];
  recentDeliveries: DeliveryRow[];
  kpis: WebhookKpis;
  siteTimezone: string;
  createWebhookSubscription: (formData: FormData) => Promise<{ secret: string }>;
  deleteSubscription: (id: number) => Promise<void>;
  rotateSecret: (id: number) => Promise<{ secret: string }>;
  retryDelivery: (id: number) => Promise<void>;
}

type DrawerMode = { kind: 'create' } | { kind: 'edit'; row: SubscriptionRow } | null;

function timeAgo(d: string): string {
  const dt = new Date(d);
  const s = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

function StatusBadge({ s }: { s: SubscriptionRow['status'] }) {
  if (s === 'active') return <Badge tone="green">活跃</Badge>;
  if (s === 'failing') return <Badge tone="rose">失败中</Badge>;
  return <Badge>未验证</Badge>;
}

function HttpBadge({ code, status }: { code: number | null; status: DeliveryRow['status'] }) {
  if (code == null) {
    if (status === 'pending') return <Badge tone="amber">待发</Badge>;
    if (status === 'failed') return <Badge tone="rose">超时</Badge>;
    return <Badge>—</Badge>;
  }
  if (code === 0) return <Badge tone="rose">超时</Badge>;
  if (code >= 200 && code < 300) {
    return (
      <Badge tone="green" className="tabular">
        {code}
      </Badge>
    );
  }
  if (code >= 400) {
    return (
      <Badge tone="rose" className="tabular">
        {code}
      </Badge>
    );
  }
  return (
    <Badge tone="amber" className="tabular">
      {code}
    </Badge>
  );
}

export function SubscriptionsTable({
  subs,
  recentDeliveries,
  kpis,
  siteTimezone,
  createWebhookSubscription,
  deleteSubscription,
  rotateSecret,
  retryDelivery,
}: Props) {
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  // 创建 / 轮换后,只在内存里短暂展示一次 secret;无任何后续显示路径。
  const [revealedOnce, setRevealedOnce] = useState<{ id: number | 'new'; secret: string } | null>(
    null,
  );
  const close = () => setDrawer(null);
  const editing = drawer?.kind === 'edit' ? drawer.row : null;
  const { toast, run } = useDrawerActions();

  const handleCreate = async (fd: FormData): Promise<void> => {
    try {
      const result = await createWebhookSubscription(fd);
      setRevealedOnce({ id: 'new', secret: result.secret });
      close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`创建失败：${msg}`);
    }
  };
  const handleRotate = async (id: number): Promise<void> => {
    try {
      const result = await rotateSecret(id);
      setRevealedOnce({ id, secret: result.secret });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`轮换失败：${msg}`);
    }
  };
  const handleDelete = (id: number) => {
    run(() => deleteSubscription(id), close, { okText: '已删除' });
  };
  const handleRetry = (id: number) => {
    run(() => retryDelivery(id), undefined, { okText: '已重试' });
  };

  return (
    <>
      <PageHeader
        title="Webhook 订阅"
        description="将事件、状态变化、维护实时推送到下游：Slack / Discord / 自建接收端等。"
        actions={
          <PrimaryButton size="md" onClick={() => setDrawer({ kind: 'create' })}>
            <Icon d="plus" size={13} /> 新建订阅
          </PrimaryButton>
        }
      />

      {/* KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <StatCard label="订阅总数" value={kpis.total} icon="webhook" />
        <StatCard
          label="失败中"
          value={kpis.failing}
          tone={kpis.failing > 0 ? 'rose' : 'neutral'}
          icon="webhook"
        />
        <StatCard label="24h 投递" value={kpis.deliveriesLast24h} icon="webhook" />
        <StatCard
          label="失败率"
          value={`${(kpis.failRate * 100).toFixed(1)}%`}
          tone={kpis.failRate > 0.05 ? 'amber' : 'neutral'}
          icon="webhook"
        />
      </div>

      {/* Subscription list */}
      <SectionH>订阅列表</SectionH>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
        <Table>
          <thead>
            <tr>
              <Th>URL / 标签</Th>
              <Th style={{ width: 240 }}>Secret</Th>
              <Th style={{ width: 80 }}>事件</Th>
              <Th style={{ width: 100 }}>状态</Th>
              <Th style={{ width: 110 }}>创建</Th>
              <Th style={{ width: 80 }}>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {subs.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="subtle"
                  style={{ padding: '32px 14px', textAlign: 'center', fontSize: 12 }}
                >
                  尚无订阅，点击右上角「新建订阅」
                </td>
              </tr>
            ) : (
              subs.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setDrawer({ kind: 'edit', row: s })}
                  style={{ cursor: 'pointer' }}
                >
                  <Td>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{s.label ?? '—'}</div>
                    <div
                      className="subtle mono"
                      style={{
                        fontSize: 11,
                        marginTop: 2,
                        maxWidth: 360,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.target}
                    </div>
                  </Td>
                  <Td>
                    <span className="mono subtle" style={{ fontSize: 11 }}>
                      {s.secretMask ?? '—'}
                    </span>
                  </Td>
                  <Td>
                    <Badge>{s.eventCount}</Badge>
                  </Td>
                  <Td>
                    <StatusBadge s={s.status} />
                  </Td>
                  <Td className="tabular subtle" style={{ fontSize: 11.5 }}>
                    {timeAgo(s.createdAt)}
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <IconButton title="编辑" onClick={() => setDrawer({ kind: 'edit', row: s })}>
                      <Icon d="edit" size={12} />
                    </IconButton>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>

      {/* Recent deliveries */}
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <SectionH style={{ margin: 0 }}>最近 20 次投递</SectionH>
        <span className="subtle" style={{ fontSize: 11.5 }}>
          失败的投递将自动重试至多 5 次（指数退避）
        </span>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <Table>
          <thead>
            <tr>
              <Th style={{ width: 130 }}>时间</Th>
              <Th>订阅</Th>
              <Th style={{ width: 200 }}>事件</Th>
              <Th style={{ width: 80 }}>状态</Th>
              <Th style={{ width: 70 }}>耗时</Th>
              <Th style={{ width: 70 }}>尝试</Th>
              <Th style={{ width: 80 }}>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {recentDeliveries.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="subtle"
                  style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12 }}
                >
                  尚无投递
                </td>
              </tr>
            ) : (
              recentDeliveries.map((d) => (
                <tr key={d.id}>
                  <Td className="tabular subtle" style={{ fontSize: 11.5 }}>
                    {fmtTz(d.deliveredAt ?? d.createdAt, siteTimezone, 'short')}
                  </Td>
                  <Td style={{ fontSize: 12.5 }}>
                    {d.subscriptionLabel ?? `#${d.subscriptionId}`}
                  </Td>
                  <Td>
                    <Badge className="mono" style={{ fontSize: 10.5 }}>
                      {d.eventType}
                    </Badge>
                  </Td>
                  <Td>
                    <HttpBadge code={d.httpStatus} status={d.status} />
                  </Td>
                  <Td className="tabular subtle" style={{ fontSize: 11.5 }}>
                    {d.durationMs != null ? `${d.durationMs} ms` : '—'}
                  </Td>
                  <Td className="tabular" style={{ fontSize: 12 }}>
                    {d.attempts > 1 ? (
                      <span style={{ color: 'var(--st-deg)' }}>{d.attempts}/5</span>
                    ) : (
                      <span className="subtle">{d.attempts}/5</span>
                    )}
                  </Td>
                  <Td>
                    {d.status !== 'delivered' ? (
                      <SecondaryButton
                        onClick={() => handleRetry(d.id)}
                        title={d.lastError ?? '重试'}
                      >
                        重试
                      </SecondaryButton>
                    ) : (
                      <span className="subtle" style={{ fontSize: 11 }}>
                        —
                      </span>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>

      {/* Edit Sheet */}
      <Sheet
        open={drawer?.kind === 'edit'}
        onClose={close}
        eyebrow="Editor"
        title={editing?.label ?? 'Webhook'}
        footer={
          editing ? (
            <>
              <DangerButton size="md" onClick={() => handleDelete(editing.id)}>
                <Icon d="trash" size={12} /> 删除
              </DangerButton>
              <div style={{ flex: 1 }} />
              <SecondaryButton size="md" onClick={() => handleRotate(editing.id)}>
                <Icon d="refresh" size={12} /> 轮换 Secret
              </SecondaryButton>
              <SecondaryButton size="md" onClick={close}>
                取消
              </SecondaryButton>
            </>
          ) : null
        }
      >
        {editing && (
          <>
            <div className="row" style={{ gap: 8, marginBottom: 18 }}>
              <StatusBadge s={editing.status} />
              <span className="subtle" style={{ fontSize: 12 }}>
                创建于 {fmtTz(editing.createdAt, siteTimezone, 'datetime')}
              </span>
            </div>
            <Field label="URL">
              <TextInput value={editing.target} readOnly className="mono" />
            </Field>
            <Field label="标签">
              <TextInput value={editing.label ?? ''} readOnly />
            </Field>
            <Field
              label="Secret"
              hint="HMAC-SHA256 签名以 X-FAU-Signature 头发送。明文只在创建/轮换后展示一次,事后只能看到末 4 位掩码;丢失请点「轮换 Secret」。"
            >
              <TextInput value={editing.secretMask ?? '—'} readOnly className="mono" />
            </Field>

            <div style={{ marginTop: 8 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, margin: '12px 0 8px' }}>
                该订阅最近投递
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {recentDeliveries
                  .filter((d) => d.subscriptionId === editing.id)
                  .slice(0, 5)
                  .map((d) => (
                    <li
                      key={d.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border)',
                        fontSize: 12,
                      }}
                    >
                      <span className="tabular subtle" style={{ width: 110, fontSize: 11 }}>
                        {fmtTz(d.deliveredAt ?? d.createdAt, siteTimezone, 'short')}
                      </span>
                      <Badge className="mono" style={{ fontSize: 10 }}>
                        {d.eventType}
                      </Badge>
                      <span style={{ flex: 1 }} />
                      <HttpBadge code={d.httpStatus} status={d.status} />
                      <span className="tabular subtle" style={{ fontSize: 11 }}>
                        {d.durationMs != null ? `${d.durationMs} ms` : '—'}
                      </span>
                    </li>
                  ))}
                {recentDeliveries.filter((d) => d.subscriptionId === editing.id).length === 0 && (
                  <li className="subtle" style={{ fontSize: 12 }}>
                    暂无投递
                  </li>
                )}
              </ul>
            </div>
          </>
        )}
      </Sheet>

      {/* Create Sheet */}
      <Sheet
        open={drawer?.kind === 'create'}
        onClose={close}
        eyebrow="Editor"
        title="新建 Webhook 订阅"
        footer={
          <>
            <SecondaryButton size="md" onClick={close}>
              取消
            </SecondaryButton>
            <PrimaryButton size="md" type="submit" form="sub-create-form">
              创建
            </PrimaryButton>
          </>
        }
      >
        <form id="sub-create-form" action={handleCreate} className="fade-in">
          <Field label="URL" hint="必须是 https:// 或 http://">
            <TextInput
              name="target"
              className="mono"
              placeholder="https://example.com/webhook"
              required
            />
          </Field>
          <Field label="标签（可选）">
            <TextInput name="label" placeholder="例：Slack #ops" />
          </Field>
          <Field label="订阅事件" hint="留空 = 全部">
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
              {SUBSCRIPTION_EVENTS.map((ev) => (
                <EventCheckbox key={ev} event={ev} />
              ))}
            </div>
          </Field>
        </form>
      </Sheet>

      {/* One-time secret reveal: shown after create/rotate; closing clears from memory. */}
      <Sheet
        open={revealedOnce !== null}
        onClose={() => setRevealedOnce(null)}
        eyebrow="Secret"
        title={revealedOnce?.id === 'new' ? '订阅已创建' : 'Secret 已轮换'}
        footer={
          <>
            <div style={{ flex: 1 }} />
            <PrimaryButton size="md" onClick={() => setRevealedOnce(null)}>
              我已保存,关闭
            </PrimaryButton>
          </>
        }
      >
        {revealedOnce && (
          <>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 0 }}>
              这是该订阅的 HMAC-SHA256 Secret,**只展示这一次**。请立即复制并配置到接收端;
              本面板关闭后无法再次查看,只能再次「轮换 Secret」生成新的。
            </p>
            <Field label="Secret(请立即复制)">
              <TextInput
                value={revealedOnce.secret}
                readOnly
                className="mono"
                onFocus={(e) => (e.target as HTMLInputElement).select()}
              />
            </Field>
          </>
        )}
      </Sheet>

      <Toast toast={toast} />
    </>
  );
}

function EventCheckbox({ event }: { event: string }) {
  const [checked, setChecked] = useState(true);
  return (
    <label className="row" style={{ gap: 8, fontSize: 12, padding: '4px 6px', cursor: 'pointer' }}>
      <StyledCheckbox
        checked={checked}
        onChange={setChecked}
        name="events"
        value={event}
        ariaLabel={event}
      />
      <span className="mono">{event}</span>
    </label>
  );
}
