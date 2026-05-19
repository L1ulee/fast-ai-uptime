'use client';

import Link from 'next/link';
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
  Th,
} from '@/components/admin/forms';
import { Icon } from '@/components/admin/icon';
import { ProviderMark } from '@/components/admin/provider-mark';
import { StyledCheckbox } from '@/components/admin/styled-checkbox';
import { Sheet } from '@/components/ui/sheet';
import { Toast, useDrawerActions } from '@/components/admin/use-drawer-actions';

export interface ProviderRow {
  id: number;
  name: string;
  type: string;
  baseUrl: string | null;
  hasApiKey: boolean;
}

export interface ModelRow {
  id: number;
  modelName: string;
  capability: string[] | null;
  providerId: number;
  providerName: string;
  providerType: string;
  usedInConfigs: number;
}

export interface DiscoveryState {
  providerId: number;
  providerName: string;
  providerType: string;
  ok: boolean;
  modelIds: string[];
  error?: string;
}

interface Props {
  providers: ProviderRow[];
  models: ModelRow[];
  discovery: DiscoveryState | null;
  createModel: (formData: FormData) => Promise<void>;
  editModel: (formData: FormData) => Promise<void>;
  deleteModel: (id: number) => Promise<void>;
  bulkDeleteModels: (formData: FormData) => Promise<void>;
  importDiscoveredModels: (formData: FormData) => Promise<void>;
}

type DrawerMode = { kind: 'create' } | { kind: 'edit'; row: ModelRow } | null;

export function ModelsTable({
  providers,
  models,
  discovery,
  createModel,
  editModel,
  deleteModel,
  bulkDeleteModels,
  importDiscoveredModels,
}: Props) {
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [filter, setFilter] = useState<'all' | number>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const close = () => setDrawer(null);
  const editing = drawer?.kind === 'edit' ? drawer.row : null;
  const { toast, run } = useDrawerActions();

  const handleCreate = async (fd: FormData): Promise<void> => {
    run(() => createModel(fd), close, { okText: '已创建' });
  };
  const handleEdit = async (fd: FormData): Promise<void> => {
    run(() => editModel(fd), close, { okText: '已保存' });
  };
  const handleDelete = (id: number) => {
    run(() => deleteModel(id), close, { okText: '已删除' });
  };
  const handleBulkDelete = async (fd: FormData): Promise<void> => {
    run(
      () => bulkDeleteModels(fd),
      () => setSelected(new Set()),
      { okText: '批量删除完成' },
    );
  };

  const filtered = filter === 'all' ? models : models.filter((m) => m.providerId === filter);

  const toggle = (id: number) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  const allSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));
  const toggleAll = () => {
    const s = new Set(selected);
    if (allSelected) filtered.forEach((m) => s.delete(m.id));
    else filtered.forEach((m) => s.add(m.id));
    setSelected(s);
  };

  return (
    <>
      <PageHeader
        title="模型"
        description="每个 Provider 下注册的模型，作为新建组件时的下拉源。"
        actions={
          <PrimaryButton size="md" onClick={() => setDrawer({ kind: 'create' })}>
            <Icon d="plus" size={13} /> 添加模型
          </PrimaryButton>
        }
      />

      {/* Provider chips with discovery */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>从 Provider 自动发现</h2>
          <span className="subtle" style={{ fontSize: 11 }}>
            调用 Provider /models 接口列出可用模型，勾选后批量导入
          </span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {providers.map((p) => (
            <Link
              key={p.id}
              href={p.hasApiKey ? `/admin/models?discover=${p.id}` : '#'}
              className="btn btn-sm"
              style={{
                pointerEvents: p.hasApiKey ? undefined : 'none',
                opacity: p.hasApiKey ? 1 : 0.5,
              }}
              aria-disabled={!p.hasApiKey}
              title={
                p.hasApiKey ? '点击发现该 Provider 上的模型' : '请先为该 Provider 设置 API Key'
              }
            >
              <ProviderMark type={p.type} size={14} />
              <span style={{ marginLeft: 6 }}>{p.name}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Filter chips + bulk delete */}
      <form action={handleBulkDelete}>
        <div className="row" style={{ gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部 · {models.length}
          </button>
          {providers.map((p) => {
            const count = models.filter((m) => m.providerId === p.id).length;
            if (count === 0) return null;
            return (
              <button
                key={p.id}
                type="button"
                className={`btn btn-sm ${filter === p.id ? 'btn-primary' : ''}`}
                onClick={() => setFilter(p.id)}
              >
                {p.name} · {count}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          {selected.size > 0 && (
            <DangerButton type="submit">
              <Icon d="trash" size={12} /> 删除 {selected.size} 个
            </DangerButton>
          )}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <Table>
            <thead>
              <tr>
                <Th style={{ width: 30 }}>
                  <StyledCheckbox checked={allSelected} onChange={toggleAll} ariaLabel="全选" />
                </Th>
                <Th>模型 ID</Th>
                <Th style={{ width: 150 }}>Provider</Th>
                <Th>能力</Th>
                <Th style={{ width: 96 }}>已用</Th>
                <Th style={{ width: 80 }}>{''}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="subtle"
                    style={{ padding: '32px 14px', textAlign: 'center', fontSize: 12 }}
                  >
                    {models.length === 0
                      ? '尚无模型，点击右上角「添加模型」'
                      : '该 Provider 暂无模型'}
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => setDrawer({ kind: 'edit', row: m })}
                    style={{ cursor: 'pointer' }}
                  >
                    <Td onClick={(e) => e.stopPropagation()}>
                      <StyledCheckbox
                        checked={selected.has(m.id)}
                        onChange={() => toggle(m.id)}
                        name="selected"
                        value={m.id}
                        ariaLabel={`select ${m.modelName}`}
                      />
                    </Td>
                    <Td>
                      <span className="mono" style={{ fontSize: 12.5, fontWeight: 500 }}>
                        {m.modelName}
                      </span>
                    </Td>
                    <Td>
                      <div className="row" style={{ gap: 8 }}>
                        <ProviderMark type={m.providerType} size={16} />
                        <span style={{ fontSize: 12.5 }}>{m.providerName}</span>
                      </div>
                    </Td>
                    <Td>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {(m.capability ?? []).map((cap) => (
                          <Badge key={cap} style={{ fontSize: 10 }}>
                            {cap}
                          </Badge>
                        ))}
                        {(m.capability == null || m.capability.length === 0) && (
                          <span className="subtle" style={{ fontSize: 11 }}>
                            —
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      {m.usedInConfigs > 0 ? (
                        <Badge tone="green" style={{ whiteSpace: 'nowrap' }}>
                          {m.usedInConfigs} 个组件
                        </Badge>
                      ) : (
                        <span className="subtle" style={{ fontSize: 11 }}>
                          未使用
                        </span>
                      )}
                    </Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <IconButton title="编辑" onClick={() => setDrawer({ kind: 'edit', row: m })}>
                        <Icon d="edit" size={12} />
                      </IconButton>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
      </form>

      {/* Discovery Sheet (URL-driven via ?discover=<id>) */}
      <DiscoverySheet
        discovery={discovery}
        existingModelsByProvider={Object.fromEntries(
          providers.map((p) => [
            p.id,
            models.filter((m) => m.providerId === p.id).map((m) => m.modelName),
          ]),
        )}
        importDiscoveredModels={importDiscoveredModels}
      />

      {/* Edit Sheet */}
      <Sheet
        open={drawer?.kind === 'edit'}
        onClose={close}
        eyebrow="Editor"
        title={editing?.modelName ?? '模型'}
        footer={
          editing ? (
            <>
              <DangerButton
                size="md"
                onClick={() => handleDelete(editing.id)}
                disabled={editing.usedInConfigs > 0}
                title={editing.usedInConfigs > 0 ? '删除前请先解绑使用方' : '删除'}
              >
                <Icon d="trash" size={12} /> 删除
              </DangerButton>
              <div style={{ flex: 1 }} />
              <SecondaryButton size="md" onClick={close}>
                取消
              </SecondaryButton>
              <PrimaryButton size="md" type="submit" form={`model-edit-form-${editing.id}`}>
                保存
              </PrimaryButton>
            </>
          ) : null
        }
      >
        {editing && (
          <form id={`model-edit-form-${editing.id}`} action={handleEdit} className="fade-in">
            <input type="hidden" name="id" value={editing.id} />
            <Field label="模型 ID" hint="必须与 Provider 接口接受的 model 字段完全一致">
              <TextInput
                name="model_name"
                defaultValue={editing.modelName}
                className="mono"
                required
              />
            </Field>
            <Field label="Provider">
              <div
                className="input"
                style={{
                  background: 'var(--bg-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <ProviderMark type={editing.providerType} size={16} />
                <span>{editing.providerName}</span>
              </div>
            </Field>
            <Field label="能力标签" hint="逗号分隔，用于 UI 分类">
              <TextInput name="capability" defaultValue={(editing.capability ?? []).join(', ')} />
            </Field>
            {editing.usedInConfigs > 0 && (
              <div
                className="card"
                style={{
                  padding: 12,
                  background: 'var(--st-deg-bg)',
                  borderColor: 'transparent',
                  fontSize: 12,
                }}
              >
                <span style={{ color: 'var(--st-deg)', fontWeight: 600 }}>⚠</span> 已被{' '}
                {editing.usedInConfigs} 个组件使用，删除前请先解绑。
              </div>
            )}
          </form>
        )}
      </Sheet>

      {/* Create Sheet */}
      <Sheet
        open={drawer?.kind === 'create'}
        onClose={close}
        eyebrow="Editor"
        title="添加模型"
        footer={
          <>
            <SecondaryButton size="md" onClick={close}>
              取消
            </SecondaryButton>
            <PrimaryButton size="md" type="submit" form="model-create-form">
              创建
            </PrimaryButton>
          </>
        }
      >
        <form id="model-create-form" action={handleCreate} className="fade-in">
          <Field label="Provider">
            <select className="select" name="provider_id" required>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="模型 ID">
            <TextInput name="model_name" placeholder="例：gpt-4o" className="mono" required />
          </Field>
          <Field label="能力标签">
            <TextInput name="capability" placeholder="chat, vision, tools" />
          </Field>
        </form>
      </Sheet>

      <Toast toast={toast} />
    </>
  );
}

function DiscoverySheet({
  discovery,
  existingModelsByProvider,
  importDiscoveredModels,
}: {
  discovery: DiscoveryState | null;
  existingModelsByProvider: Record<number, string[]>;
  importDiscoveredModels: (formData: FormData) => Promise<void>;
}) {
  const closeDiscovery = () => {
    if (typeof window !== 'undefined') window.location.assign('/admin/models');
  };
  return (
    <Sheet
      open={!!discovery}
      onClose={closeDiscovery}
      eyebrow="Discover"
      title={discovery ? `发现：${discovery.providerName}` : '发现'}
      footer={
        discovery && discovery.ok ? (
          <>
            <SecondaryButton size="md" onClick={closeDiscovery}>
              取消
            </SecondaryButton>
            <PrimaryButton size="md" type="submit" form="model-import-form">
              导入选中
            </PrimaryButton>
          </>
        ) : (
          <SecondaryButton size="md" onClick={closeDiscovery}>
            关闭
          </SecondaryButton>
        )
      }
    >
      {discovery && (
        <>
          <div
            className="card"
            style={{ padding: 12, marginBottom: 16, background: 'var(--bg-subtle)' }}
          >
            <div className="row" style={{ gap: 10 }}>
              <ProviderMark type={discovery.providerType} size={28} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{discovery.providerName}</div>
                <div className="subtle mono" style={{ fontSize: 11.5 }}>
                  GET /models
                </div>
              </div>
              {discovery.ok ? (
                <Badge tone="green">{discovery.modelIds.length} 个候选</Badge>
              ) : (
                <Badge tone="rose">失败</Badge>
              )}
            </div>
          </div>

          {!discovery.ok && (
            <div
              className="card"
              style={{
                padding: 12,
                background: 'var(--st-major-bg)',
                borderColor: 'transparent',
                color: 'var(--st-major)',
                fontSize: 12.5,
                marginBottom: 16,
              }}
            >
              {discovery.error ?? '未知错误'}
            </div>
          )}

          {discovery.ok && (
            <>
              <div
                className="subtle"
                style={{
                  fontSize: 11.5,
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                }}
              >
                已存在 ✓ 不会再次导入
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 6,
                  marginBottom: 18,
                }}
              >
                {(existingModelsByProvider[discovery.providerId] ?? []).length === 0 ? (
                  <div
                    className="subtle"
                    style={{
                      gridColumn: '1 / -1',
                      fontSize: 12.5,
                      padding: '10px',
                      textAlign: 'center',
                    }}
                  >
                    （无）
                  </div>
                ) : (
                  (existingModelsByProvider[discovery.providerId] ?? []).map((name) => (
                    <div
                      key={name}
                      className="row"
                      style={{
                        gap: 8,
                        padding: '6px 10px',
                        background: 'var(--bg-subtle)',
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: 'var(--st-op)' }}>✓</span>
                      <span className="mono">{name}</span>
                    </div>
                  ))
                )}
              </div>

              <DiscoveryImportForm
                key={discovery.providerId}
                providerId={discovery.providerId}
                modelIds={discovery.modelIds}
                importDiscoveredModels={importDiscoveredModels}
              />
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

/**
 * 自动发现结果的导入表单。勾选状态上提到此组件统一管理，
 * 默认全选（保持原行为）。父级用 key={providerId} 保证切换 Provider 时状态重置。
 */
function DiscoveryImportForm({
  providerId,
  modelIds,
  importDiscoveredModels,
}: {
  providerId: number;
  modelIds: string[];
  importDiscoveredModels: (formData: FormData) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(modelIds));
  const allSelected = modelIds.length > 0 && modelIds.every((id) => selected.has(id));

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(modelIds));
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <span
          className="subtle"
          style={{
            fontSize: 11.5,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 600,
          }}
        >
          新发现 — 选择导入
        </span>
        {modelIds.length > 0 && (
          <span className="row" style={{ gap: 6, fontSize: 12 }}>
            <StyledCheckbox checked={allSelected} onChange={toggleAll} ariaLabel="全选" />
            <span className="subtle" style={{ cursor: 'pointer' }} onClick={toggleAll}>
              全选
            </span>
          </span>
        )}
      </div>
      <form id="model-import-form" action={importDiscoveredModels}>
        <input type="hidden" name="provider_id" value={providerId} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {modelIds.length === 0 ? (
            <div
              className="subtle"
              style={{
                gridColumn: '1 / -1',
                fontSize: 12.5,
                padding: '20px 10px',
                textAlign: 'center',
              }}
            >
              未发现新模型
            </div>
          ) : (
            modelIds.map((id) => (
              <label
                key={id}
                className="row"
                style={{
                  gap: 8,
                  padding: '7px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}
              >
                <StyledCheckbox
                  checked={selected.has(id)}
                  onChange={() => toggle(id)}
                  name="model"
                  value={id}
                  ariaLabel={id}
                />
                <span className="mono" style={{ flex: 1 }}>
                  {id}
                </span>
              </label>
            ))
          )}
        </div>
      </form>
    </>
  );
}
