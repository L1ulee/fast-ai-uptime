'use client';

import { useState } from 'react';
import {
  Badge,
  Field,
  IconButton,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  Table,
  Td,
  TextInput,
  Textarea,
  Th,
} from '@/components/admin/forms';
import { Icon } from '@/components/admin/icon';
import { Sheet } from '@/components/ui/sheet';
import { Toast, useDrawerActions } from '@/components/admin/use-drawer-actions';

export interface GroupAdminTableRow {
  id: number;
  slug: string;
  displayName: string;
  description: string | null;
  sortOrder: number;
  componentCount: number;
}

interface Props {
  rows: GroupAdminTableRow[];
  createGroup: (formData: FormData) => Promise<void>;
  editGroup: (formData: FormData) => Promise<void>;
  deleteGroup: (id: number) => Promise<void>;
}

type DrawerMode = { kind: 'create' } | { kind: 'edit'; row: GroupAdminTableRow } | null;

export function GroupsTable({ rows, createGroup, editGroup, deleteGroup }: Props) {
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const close = () => setDrawer(null);
  const editing = drawer?.kind === 'edit' ? drawer.row : null;
  const { toast, run } = useDrawerActions();

  const handleCreate = async (fd: FormData): Promise<void> => {
    run(() => createGroup(fd), close, { okText: '已创建' });
  };
  const handleEdit = async (fd: FormData): Promise<void> => {
    run(() => editGroup(fd), close, { okText: '已保存' });
  };
  const handleDelete = (id: number) => {
    run(() => deleteGroup(id), close, { okText: '已删除' });
  };

  return (
    <>
      <PageHeader
        title="组件分组"
        description="决定公共页组件区的分组顺序与名称（OpenAI / Anthropic / Google / 自建）。"
        actions={
          <PrimaryButton size="md" onClick={() => setDrawer({ kind: 'create' })}>
            <Icon d="plus" size={13} /> 新建分组
          </PrimaryButton>
        }
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        <Table>
          <thead>
            <tr>
              <Th style={{ width: 36 }}>排序</Th>
              <Th>名称</Th>
              <Th style={{ width: 140 }}>Slug</Th>
              <Th>描述</Th>
              <Th style={{ width: 80 }}>组件</Th>
              <Th style={{ width: 80 }}>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="subtle"
                  style={{ padding: '32px 14px', textAlign: 'center', fontSize: 12 }}
                >
                  尚无分组
                </td>
              </tr>
            ) : (
              rows.map((g, i) => (
                <tr
                  key={g.id}
                  onClick={() => setDrawer({ kind: 'edit', row: g })}
                  style={{ cursor: 'pointer' }}
                >
                  <Td className="subtle tabular" style={{ fontSize: 12 }}>
                    {i + 1}
                  </Td>
                  <Td>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{g.displayName}</span>
                  </Td>
                  <Td className="mono subtle" style={{ fontSize: 11.5 }}>
                    {g.slug}
                  </Td>
                  <Td
                    className="subtle"
                    style={{
                      fontSize: 12,
                      maxWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {g.description ?? '—'}
                  </Td>
                  <Td>
                    <Badge>{g.componentCount}</Badge>
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <IconButton title="编辑" onClick={() => setDrawer({ kind: 'edit', row: g })}>
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
        title={editing?.displayName ?? '分组'}
        footer={
          editing ? (
            <>
              <DangerButton
                size="md"
                onClick={() => handleDelete(editing.id)}
                disabled={editing.componentCount > 0}
                title={editing.componentCount > 0 ? '该分组下还有组件，请先解绑' : '删除'}
              >
                <Icon d="trash" size={12} /> 删除
              </DangerButton>
              <div style={{ flex: 1 }} />
              <SecondaryButton size="md" onClick={close}>
                取消
              </SecondaryButton>
              <PrimaryButton size="md" type="submit" form={`group-edit-form-${editing.id}`}>
                保存
              </PrimaryButton>
            </>
          ) : null
        }
      >
        {editing && (
          <form id={`group-edit-form-${editing.id}`} action={handleEdit} className="fade-in">
            <input type="hidden" name="id" value={editing.id} />
            <Field label="显示名称">
              <TextInput name="display_name" defaultValue={editing.displayName} required />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Slug" hint="小写字母 / 数字 / - / _，用于 URL">
                <TextInput name="slug" defaultValue={editing.slug} className="mono" required />
              </Field>
              <Field label="排序" hint="数值越小越靠前">
                <TextInput
                  name="sort_order"
                  type="number"
                  defaultValue={editing.sortOrder}
                  className="tabular"
                />
              </Field>
            </div>
            <Field label="描述">
              <Textarea name="description" defaultValue={editing.description ?? ''} rows={3} />
            </Field>
            <div className="subtle" style={{ fontSize: 11.5, marginTop: 4 }}>
              包含 {editing.componentCount} 个组件
            </div>
          </form>
        )}
      </Sheet>

      {/* Create Sheet */}
      <Sheet
        open={drawer?.kind === 'create'}
        onClose={close}
        eyebrow="Editor"
        title="新建分组"
        footer={
          <>
            <SecondaryButton size="md" onClick={close}>
              取消
            </SecondaryButton>
            <PrimaryButton size="md" type="submit" form="group-create-form">
              创建
            </PrimaryButton>
          </>
        }
      >
        <form id="group-create-form" action={handleCreate} className="fade-in">
          <Field label="显示名称">
            <TextInput name="display_name" placeholder="例：开源模型" required />
          </Field>
          <Field label="Slug" hint="小写字母 / 数字 / - / _">
            <TextInput name="slug" placeholder="open-source" className="mono" required />
          </Field>
          <Field label="排序">
            <TextInput name="sort_order" type="number" defaultValue={0} className="tabular" />
          </Field>
          <Field label="描述">
            <Textarea name="description" rows={3} />
          </Field>
        </form>
      </Sheet>

      <Toast toast={toast} />
    </>
  );
}
