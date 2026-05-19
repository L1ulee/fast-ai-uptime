'use client';

import { Eye, EyeOff } from 'lucide-react';
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
import { Sheet } from '@/components/ui/sheet';
import { Toast, useDrawerActions } from '@/components/admin/use-drawer-actions';

import { PROVIDER_TYPES, type ProviderType } from './admin-shared';
export { PROVIDER_TYPES };
export type { ProviderType };

export const DEFAULT_BASE_URL: Record<ProviderType, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  custom: '',
};

export interface ProviderRow {
  id: number;
  type: ProviderType;
  name: string;
  baseUrl: string | null;
  homepage: string | null;
  hasApiKey: boolean;
  apiKeyMask: string | null;
  modelCount: number;
  updatedAt: string;
}

interface Props {
  rows: ProviderRow[];
  createProvider: (formData: FormData) => Promise<void>;
  editProvider: (formData: FormData) => Promise<void>;
  deleteProvider: (id: number) => Promise<void>;
}

type DrawerMode = { kind: 'create' } | { kind: 'edit'; row: ProviderRow } | null;

function timeAgo(d: string): string {
  const dt = new Date(d);
  const s = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

/**
 * API Key 输入框 —— 默认掩码（type=password），右侧小眼睛切换明文/掩码。
 * 非受控（用 defaultValue），表单原样提交。
 *
 * 安全:服务端不再把明文 Key 传到客户端。编辑时该字段始终为空,提交语义:
 *   - 留空 → 保持现有 Key 不变
 *   - 输入新值 → 替换（AES-256 加密落库）
 *   - 删除 → 由旁边的「清除」按钮另行处理（提交 clear_api_key=1）
 */
function ApiKeyField({ name, placeholder }: { name: string; placeholder?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        name={name}
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        autoComplete="off"
        className="input mono"
        style={{ paddingRight: 38 }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? '隐藏 API Key' : '显示 API Key'}
        title={visible ? '隐藏' : '显示'}
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--fg-subtle)',
          cursor: 'pointer',
          borderRadius: 4,
        }}
      >
        {visible ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
      </button>
    </div>
  );
}

export function ProvidersTable({ rows, createProvider, editProvider, deleteProvider }: Props) {
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const close = () => setDrawer(null);
  const editing = drawer?.kind === 'edit' ? drawer.row : null;
  const { toast, run } = useDrawerActions();

  const handleCreate = async (fd: FormData): Promise<void> => {
    run(() => createProvider(fd), close, { okText: '已创建' });
  };
  const handleEdit = async (fd: FormData): Promise<void> => {
    run(() => editProvider(fd), close, { okText: '已保存' });
  };
  const handleDelete = (id: number) => {
    run(() => deleteProvider(id), close, { okText: '已删除' });
  };

  return (
    <>
      <PageHeader
        title="Providers"
        description="AI 服务供应商：baseUrl、API Key（AES-256 加密）、上游状态页地址。"
        actions={
          <PrimaryButton size="md" onClick={() => setDrawer({ kind: 'create' })}>
            <Icon d="plus" size={13} /> 新建 Provider
          </PrimaryButton>
        }
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        <Table>
          <thead>
            <tr>
              <Th>名称</Th>
              <Th style={{ width: 80 }}>类型</Th>
              <Th>baseUrl</Th>
              <Th style={{ width: 130 }}>API Key</Th>
              <Th style={{ width: 60 }}>模型</Th>
              <Th style={{ width: 100 }}>更新</Th>
              <Th style={{ width: 80 }}>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="subtle"
                  style={{ padding: '32px 14px', textAlign: 'center', fontSize: 12 }}
                >
                  尚无 Provider，点击右上角「新建 Provider」添加
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
                      <ProviderMark type={p.type} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                        {p.homepage && (
                          <a
                            href={p.homepage}
                            className="subtle"
                            style={{ fontSize: 11 }}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            主页 ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge className="mono" style={{ fontSize: 10 }}>
                      {p.type}
                    </Badge>
                  </Td>
                  <Td
                    className="mono subtle"
                    style={{
                      fontSize: 11.5,
                      maxWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.baseUrl ?? '—'}
                  </Td>
                  <Td>
                    {p.hasApiKey ? (
                      <Badge tone="green">已设置</Badge>
                    ) : (
                      <Badge tone="rose">未设置</Badge>
                    )}
                  </Td>
                  <Td className="tabular subtle" style={{ fontSize: 12 }}>
                    {p.modelCount}
                  </Td>
                  <Td className="tabular subtle" style={{ fontSize: 11.5 }}>
                    {timeAgo(p.updatedAt)}
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <IconButton title="编辑" onClick={() => setDrawer({ kind: 'edit', row: p })}>
                      <Icon d="edit" size={12} />
                    </IconButton>
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
        title={editing?.name ?? 'Provider'}
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
              <PrimaryButton size="md" type="submit" form={`provider-edit-form-${editing.id}`}>
                保存
              </PrimaryButton>
            </>
          ) : null
        }
      >
        {editing && (
          <>
            <div className="row" style={{ gap: 10, marginBottom: 18 }}>
              <ProviderMark type={editing.type} size={32} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{editing.name}</div>
                <div className="subtle" style={{ fontSize: 12 }}>
                  {editing.modelCount} 个模型 · 最近更新 {timeAgo(editing.updatedAt)}
                </div>
              </div>
            </div>

            <form id={`provider-edit-form-${editing.id}`} action={handleEdit} className="fade-in">
              <input type="hidden" name="id" value={editing.id} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="显示名称">
                  <TextInput name="name" defaultValue={editing.name} required />
                </Field>
                <Field label="类型">
                  <select className="select" name="type" defaultValue={editing.type}>
                    {PROVIDER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="baseUrl" hint="模型探测请求的根地址（不带末尾 /）">
                <TextInput name="base_url" defaultValue={editing.baseUrl ?? ''} className="mono" />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="主页 URL">
                  <TextInput name="homepage" defaultValue={editing.homepage ?? ''} />
                </Field>
                <Field label="模型数量">
                  <div
                    className="input"
                    style={{
                      background: 'var(--bg-subtle)',
                      color: 'var(--fg-muted)',
                      cursor: 'default',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {editing.modelCount}
                  </div>
                </Field>
              </div>

              <div
                className="card"
                style={{
                  padding: 10,
                  background: 'var(--bg-subtle)',
                  borderColor: 'transparent',
                  fontSize: 11.5,
                  color: 'var(--fg-muted)',
                  marginTop: -6,
                  marginBottom: 14,
                }}
              >
                ℹ 该 Provider 的官方状态页（statuspage.io 镜像）现在在{' '}
                <a href="/admin/official-status" style={{ color: 'var(--brand)' }}>
                  「官方状态镜像」
                </a>{' '}
                中管理。
              </div>

              <Divider />

              <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>API Key</h3>
              {!editing.hasApiKey && (
                <div
                  className="card"
                  style={{
                    padding: 12,
                    background: 'var(--st-major-bg)',
                    borderColor: 'transparent',
                    color: 'var(--st-major)',
                    fontSize: 12.5,
                    marginBottom: 12,
                  }}
                >
                  未设置 API Key — 该 Provider 下所有组件均会跳过探测。
                </div>
              )}

              <Field
                label="轮换 / 设置 API Key"
                hint={
                  editing.hasApiKey
                    ? `当前 ${editing.apiKeyMask ?? '已设置'}。留空 = 保持不变；输入新值 = 替换；勾选下方「删除现有 Key」= 清除。`
                    : '粘贴新值保存即写入（AES-256 加密落库）。'
                }
              >
                <ApiKeyField
                  name="api_key"
                  placeholder={editing.hasApiKey ? '留空 = 保持不变' : 'sk-…'}
                />
              </Field>
              {editing.hasApiKey && (
                <label
                  className="row"
                  style={{
                    gap: 8,
                    marginTop: -8,
                    marginBottom: 14,
                    fontSize: 12,
                    color: 'var(--fg-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <input type="checkbox" name="clear_api_key" value="1" />
                  删除现有 API Key（与上方输入互斥；勾选时上方留空）
                </label>
              )}
            </form>
          </>
        )}
      </Sheet>

      {/* Create Sheet */}
      <Sheet
        open={drawer?.kind === 'create'}
        onClose={close}
        eyebrow="Editor"
        title="新建 Provider"
        footer={
          <>
            <SecondaryButton size="md" onClick={close}>
              取消
            </SecondaryButton>
            <PrimaryButton size="md" type="submit" form="provider-create-form">
              创建
            </PrimaryButton>
          </>
        }
      >
        <form id="provider-create-form" action={handleCreate} className="fade-in">
          <Field label="类型">
            <select className="select" name="type" defaultValue="openai" required>
              {PROVIDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="显示名称">
            <TextInput name="name" placeholder="例：OpenAI" required />
          </Field>
          <Field label="baseUrl" hint="OpenAI 兼容 SDK 的根地址">
            <TextInput
              name="base_url"
              className="mono"
              placeholder="https://api.openai.com/v1"
              list="provider-base-urls"
            />
            <datalist id="provider-base-urls">
              {Object.values(DEFAULT_BASE_URL)
                .filter(Boolean)
                .map((u) => (
                  <option key={u} value={u} />
                ))}
            </datalist>
          </Field>
          <Field label="API Key" hint="将以 AES-256 加密落库；点右侧眼睛切换显示">
            <ApiKeyField name="api_key" placeholder="sk-…" />
          </Field>
          <Field label="主页 URL">
            <TextInput name="homepage" placeholder="https://openai.com" />
          </Field>
          <div
            className="card"
            style={{
              padding: 10,
              background: 'var(--bg-subtle)',
              borderColor: 'transparent',
              fontSize: 11.5,
              color: 'var(--fg-muted)',
            }}
          >
            ℹ 创建后可在{' '}
            <a href="/admin/official-status" style={{ color: 'var(--brand)' }}>
              「官方状态镜像」
            </a>{' '}
            中绑定该 Provider 的公开 statuspage URL。
          </div>
        </form>
      </Sheet>

      <Toast toast={toast} />
    </>
  );
}
