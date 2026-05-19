import { asc, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { decryptSecret, safeFetch, SsrfBlockedError } from '@fau/core';
import { getDb, models as modelsTable, providers as providersTable } from '@fau/db';
import {
  ModelsTable,
  type DiscoveryState,
  type ModelRow,
  type ProviderRow,
} from '@/components/admin/models-table';
import { logAudit } from '@/lib/admin/audit';
import { loadModelsAdmin } from '@/lib/api/admin-aggregations';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface DiscoverResult {
  ok: boolean;
  modelIds: string[];
  error?: string;
}

async function loadData(): Promise<{ providers: ProviderRow[]; models: ModelRow[] }> {
  const db = getDb();
  const [providersRaw, enrichedModels] = await Promise.all([
    db.select().from(providersTable).orderBy(asc(providersTable.id)),
    loadModelsAdmin(),
  ]);
  const providers: ProviderRow[] = providersRaw.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    baseUrl: p.baseUrl,
    hasApiKey: Boolean(p.apiKeyEnc),
  }));
  const models: ModelRow[] = enrichedModels.map((m) => ({
    id: m.id,
    modelName: m.name,
    capability: m.capabilities,
    providerId: m.providerId,
    providerName: m.providerName,
    providerType: m.providerType,
    usedInConfigs: m.usedInConfigs,
  }));
  return { providers, models };
}

async function createModel(formData: FormData) {
  'use server';
  await requireAdmin();
  const providerId = Number(formData.get('provider_id'));
  const modelName = String(formData.get('model_name') ?? '').trim();
  const capabilityRaw = String(formData.get('capability') ?? '').trim();
  if (!Number.isFinite(providerId) || providerId <= 0) throw new Error('provider required');
  if (!modelName) throw new Error('model_name required');
  const capability = capabilityRaw
    ? capabilityRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
  const db = getDb();
  await db.insert(modelsTable).values({ providerId, modelName, capability });
  await logAudit('model.create', modelName, { providerId, capability });
  revalidatePath('/admin/models');
}

async function editModel(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  const modelName = String(formData.get('model_name') ?? '').trim();
  const capabilityRaw = String(formData.get('capability') ?? '').trim();
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  if (!modelName) throw new Error('model_name required');
  const capability = capabilityRaw
    ? capabilityRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
  const db = getDb();
  await db.update(modelsTable).set({ modelName, capability }).where(eq(modelsTable.id, id));
  await logAudit('model.edit', String(id), { modelName });
  revalidatePath('/admin/models');
}

async function deleteModel(id: number) {
  'use server';
  await requireAdmin();
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const db = getDb();
  await db.delete(modelsTable).where(eq(modelsTable.id, id));
  await logAudit('model.delete', String(id));
  revalidatePath('/admin/models');
}

async function bulkDeleteModels(formData: FormData) {
  'use server';
  await requireAdmin();
  const ids = formData
    .getAll('selected')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return;
  const db = getDb();
  await db.delete(modelsTable).where(inArray(modelsTable.id, ids));
  await logAudit('model.bulk_delete', undefined, { ids });
  revalidatePath('/admin/models');
}

async function importDiscoveredModels(formData: FormData) {
  'use server';
  await requireAdmin();
  const providerId = Number(formData.get('provider_id'));
  const selected = formData.getAll('model').map((v) => String(v));
  if (!Number.isFinite(providerId) || providerId <= 0) throw new Error('provider required');
  if (selected.length === 0) {
    redirect('/admin/models');
  }
  const db = getDb();
  await db
    .insert(modelsTable)
    .values(selected.map((modelName) => ({ providerId, modelName, capability: null })))
    .onConflictDoNothing();
  await logAudit('model.bulk_import', String(providerId), {
    count: selected.length,
  });
  redirect('/admin/models');
}

/** 调用 provider 的 /models 端点，返回模型名列表。 */
async function discoverModels(providerId: number): Promise<DiscoverResult> {
  const db = getDb();
  const [p] = await db.select().from(providersTable).where(eq(providersTable.id, providerId));
  if (!p) return { ok: false, modelIds: [], error: 'provider not found' };
  if (!p.baseUrl) return { ok: false, modelIds: [], error: '该 Provider 未配置 baseUrl' };
  let key: string | undefined;
  if (p.apiKeyEnc) {
    try {
      key = decryptSecret(p.apiKeyEnc);
    } catch {
      return { ok: false, modelIds: [], error: 'API Key 解密失败' };
    }
  }
  const url = joinUrl(p.baseUrl, '/models');
  const headers: Record<string, string> = { accept: 'application/json' };
  if (p.type === 'openai' || p.type === 'custom') {
    if (key) headers['authorization'] = `Bearer ${key}`;
  } else if (p.type === 'anthropic') {
    if (key) headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  } else if (p.type === 'gemini') {
    if (key) headers['x-goog-api-key'] = key;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await safeFetch(url, { method: 'GET', headers, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, modelIds: [], error: `HTTP ${res.status} ${text.slice(0, 200)}` };
    }
    // 有些网关/代理对未知路径返回 200 + HTML（SPA 兜底页、WAF 验证页等），
    // 直接 res.json() 会抛出无用的 "Unexpected token '<'"。先按正文判别再解析。
    const contentType = res.headers.get('content-type') ?? '';
    const raw = await res.text();
    if (/^\s*<(?:!doctype|html|\?xml)/i.test(raw)) {
      return {
        ok: false,
        modelIds: [],
        error: `${url} 返回了 HTML/非 JSON 响应（content-type: ${contentType || '未知'}）。请检查该 Provider 的 baseUrl 是否指向 API 根路径，例如 OpenAI 应为 https://api.openai.com/v1、网关多为 https://你的域名/v1`,
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        modelIds: [],
        error: `${url} 响应不是合法 JSON（content-type: ${contentType || '未知'}）：${raw.slice(0, 200)}`,
      };
    }
    const ids = parseModelIds(json, p.type);
    return { ok: true, modelIds: ids.sort() };
  } catch (err) {
    const msg =
      err instanceof SsrfBlockedError
        ? `blocked: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, modelIds: [], error: msg };
  } finally {
    clearTimeout(timer);
  }
}

function parseModelIds(json: unknown, providerType: string): string[] {
  if (typeof json !== 'object' || json === null) return [];
  const j = json as Record<string, unknown>;
  // OpenAI / custom / Anthropic：{ data: [{ id: 'gpt-4o-mini', ... }] }
  if (Array.isArray(j.data)) {
    return j.data
      .map((m) => (typeof m === 'object' && m !== null ? (m as Record<string, unknown>).id : null))
      .filter((s): s is string => typeof s === 'string');
  }
  // Gemini: { models: [{ name: 'models/gemini-2.0-flash', ... }] }
  if (Array.isArray(j.models)) {
    return j.models
      .map((m) => {
        if (typeof m !== 'object' || m === null) return null;
        const name = (m as Record<string, unknown>).name;
        if (typeof name !== 'string') return null;
        return providerType === 'gemini' ? name.replace(/^models\//, '') : name;
      })
      .filter((s): s is string => typeof s === 'string' && s.length > 0);
  }
  return [];
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + (path.startsWith('/') ? path : `/${path}`);
}

interface PageProps {
  searchParams: Promise<{ discover?: string }>;
}

export default async function ModelsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const discoverProviderId = sp.discover ? Number(sp.discover) : undefined;
  const { providers, models } = await loadData();

  let discovery: DiscoveryState | null = null;
  if (discoverProviderId && Number.isFinite(discoverProviderId)) {
    const provider = providers.find((p) => p.id === discoverProviderId);
    if (provider) {
      const existing = new Set(
        models.filter((m) => m.providerId === provider.id).map((m) => m.modelName),
      );
      const result = await discoverModels(provider.id);
      discovery = {
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.type,
        ok: result.ok,
        modelIds: result.ok ? result.modelIds.filter((id) => !existing.has(id)) : [],
        error: result.error,
      };
    }
  }

  return (
    <ModelsTable
      providers={providers}
      models={models}
      discovery={discovery}
      createModel={createModel}
      editModel={editModel}
      deleteModel={deleteModel}
      bulkDeleteModels={bulkDeleteModels}
      importDiscoveredModels={importDiscoveredModels}
    />
  );
}
