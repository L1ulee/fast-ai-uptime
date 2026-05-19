import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { encryptSecret } from '@fau/core';
import { getDb, providers as providersTable } from '@fau/db';
import { ProvidersTable } from '@/components/admin/providers-table';
import { PROVIDER_TYPES, type ProviderType } from '@/components/admin/admin-shared';
import { logAudit } from '@/lib/admin/audit';
import { loadProvidersAdmin } from '@/lib/api/admin-aggregations';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function validateBaseUrl(s: string): string | null {
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('only http/https allowed');
    }
  } catch {
    throw new Error('baseUrl must be a valid http(s) URL');
  }
  return s.replace(/\/+$/, '');
}

async function createProvider(formData: FormData) {
  'use server';
  await requireAdmin();
  const type = String(formData.get('type') ?? '').toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  const homepage = String(formData.get('homepage') ?? '').trim() || null;
  const baseUrl = validateBaseUrl(String(formData.get('base_url') ?? '').trim());
  const apiKey = String(formData.get('api_key') ?? '').trim();
  if (!PROVIDER_TYPES.includes(type as ProviderType)) {
    throw new Error(`invalid type: ${type}`);
  }
  if (!name) throw new Error('name is required');
  const db = getDb();
  await db.insert(providersTable).values({
    type: type as ProviderType,
    name,
    homepage,
    baseUrl,
    apiKeyEnc: apiKey ? encryptSecret(apiKey) : null,
  });
  await logAudit('provider.create', name, { type, baseUrl });
  revalidatePath('/admin/providers');
}

async function editProvider(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  const type = String(formData.get('type') ?? '').toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  const homepage = String(formData.get('homepage') ?? '').trim() || null;
  const baseUrl = validateBaseUrl(String(formData.get('base_url') ?? '').trim());
  // api_key 字段不再回传明文 ——
  //   留空            → 保持现有 Key 不变（不写 apiKeyEnc 列）
  //   填值            → 覆盖（重新加密落库）
  //   clear_api_key=1 → 删除（apiKeyEnc = null），且与上方输入互斥
  const apiKeyRaw = String(formData.get('api_key') ?? '').trim();
  const clearApiKey = formData.get('clear_api_key') === '1';

  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  if (!PROVIDER_TYPES.includes(type as ProviderType)) {
    throw new Error(`invalid type: ${type}`);
  }
  if (!name) throw new Error('name is required');
  if (apiKeyRaw && clearApiKey) {
    throw new Error('不能同时输入新 API Key 与勾选"删除现有 Key"');
  }

  const update: Record<string, unknown> = {
    type: type as ProviderType,
    name,
    homepage,
    baseUrl,
    updatedAt: new Date(),
  };
  let auditOp: 'unchanged' | 'rotated' | 'cleared' = 'unchanged';
  if (clearApiKey) {
    update.apiKeyEnc = null;
    auditOp = 'cleared';
  } else if (apiKeyRaw) {
    update.apiKeyEnc = encryptSecret(apiKeyRaw);
    auditOp = 'rotated';
  }
  await getDb().update(providersTable).set(update).where(eq(providersTable.id, id));
  await logAudit('provider.edit', String(id), { name, baseUrl, apiKey: auditOp });
  revalidatePath('/admin/providers');
}

async function deleteProvider(id: number) {
  'use server';
  await requireAdmin();
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const db = getDb();
  await db.delete(providersTable).where(eq(providersTable.id, id));
  await logAudit('provider.delete', String(id));
  revalidatePath('/admin/providers');
}

export default async function ProvidersPage() {
  await requireAdmin();
  const rows = await loadProvidersAdmin();
  return (
    <ProvidersTable
      rows={rows.map((r) => ({
        id: r.id,
        type: r.type as ProviderType,
        name: r.name,
        baseUrl: r.baseUrl,
        homepage: r.homepage,
        hasApiKey: r.hasApiKey,
        apiKeyMask: r.apiKeyMask,
        modelCount: r.modelCount,
        updatedAt: r.updatedAt,
      }))}
      createProvider={createProvider}
      editProvider={editProvider}
      deleteProvider={deleteProvider}
    />
  );
}
