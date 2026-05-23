import { asc, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { encryptSecret } from '@fau/core';
import {
  checkConfigs as configsTable,
  getDb,
  groups as groupsTable,
  models as modelsTable,
  providers as providersTable,
} from '@fau/db';
import { ConfigsTable, type GroupOption, type ModelOption } from '@/components/admin/configs-table';
import { HTTP_METHODS, type HttpMethod } from '@/components/admin/admin-shared';
import { logAudit } from '@/lib/admin/audit';
import { getSettings } from '@/lib/admin/settings';
import { loadConfigsAdmin } from '@/lib/api/admin-aggregations';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function loadGroupsAndModels(): Promise<{ groups: GroupOption[]; models: ModelOption[] }> {
  const db = getDb();
  const [groupRows, modelRows] = await Promise.all([
    db.select().from(groupsTable).orderBy(asc(groupsTable.sortOrder), asc(groupsTable.id)),
    db
      .select({
        id: modelsTable.id,
        modelName: modelsTable.modelName,
        providerName: providersTable.name,
        providerType: providersTable.type,
      })
      .from(modelsTable)
      .innerJoin(providersTable, eq(modelsTable.providerId, providersTable.id))
      .orderBy(asc(providersTable.id), asc(modelsTable.modelName)),
  ]);
  const groups: GroupOption[] = groupRows.map((g) => ({
    id: g.id,
    displayName: g.displayName,
    slug: g.slug,
    sortOrder: g.sortOrder,
  }));
  const models: ModelOption[] = modelRows.map((m) => ({
    id: m.id,
    modelName: m.modelName,
    providerName: m.providerName,
    providerType: m.providerType,
  }));
  return { groups, models };
}

function clamp(v: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v));
}

function parseEndpointPair(formData: FormData): {
  endpoint: string | null;
  endpointPath: string | null;
} {
  const endpoint = String(formData.get('endpoint') ?? '').trim() || null;
  const endpointPath = String(formData.get('endpoint_path') ?? '').trim() || null;
  if (endpoint) {
    try {
      const u = new URL(endpoint);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error('only http/https');
      }
    } catch {
      throw new Error('endpoint must be a valid http(s) URL');
    }
  }
  return { endpoint, endpointPath };
}

function parseHeadersForm(formData: FormData): Array<{ key: string; val: string }> | null {
  const keys = formData.getAll('header_key').map((v) => String(v));
  const vals = formData.getAll('header_val').map((v) => String(v));
  const out: Array<{ key: string; val: string }> = [];
  for (let i = 0; i < keys.length; i += 1) {
    const k = (keys[i] ?? '').trim();
    if (!k) continue;
    out.push({ key: k, val: vals[i] ?? '' });
  }
  return out.length > 0 ? out : null;
}

function parseBodyForm(formData: FormData): string | null {
  const raw = String(formData.get('request_body') ?? '').trim();
  return raw || null;
}

function parseMethodForm(formData: FormData): HttpMethod {
  const m = String(formData.get('method') ?? 'POST').toUpperCase();
  if (!HTTP_METHODS.includes(m as HttpMethod)) {
    throw new Error('method invalid');
  }
  return m as HttpMethod;
}

async function createConfig(formData: FormData) {
  'use server';
  await requireAdmin();
  // Admin "探测默认值" —— 表单缺省/无效时回退到这里(而非硬编码 60/30000)。
  const adminProbe = (await getSettings()).probe;
  const groupIdRaw = formData.get('group_id');
  const modelId = Number(formData.get('model_id'));
  const displayName = String(formData.get('display_name') ?? '').trim();
  const method = parseMethodForm(formData);
  const headers = parseHeadersForm(formData);
  const requestBody = parseBodyForm(formData);
  const apiKey = String(formData.get('api_key') ?? '').trim();
  const pollIntervalSeconds = Number(
    formData.get('poll_interval_seconds') ?? adminProbe.intervalSec,
  );
  const timeoutMs = Number(formData.get('timeout_ms') ?? adminProbe.timeoutMs);
  const sortOrder = Number(formData.get('sort_order') ?? 0);

  if (!Number.isFinite(modelId) || modelId <= 0) throw new Error('model_id required');
  if (!displayName) throw new Error('display_name required');
  const { endpoint, endpointPath } = parseEndpointPair(formData);
  if (!endpoint && !endpointPath) {
    throw new Error('endpoint 或 endpointPath 至少填一个（endpointPath 需 Provider baseUrl）');
  }
  const groupId = groupIdRaw && groupIdRaw !== '' ? Number(groupIdRaw) : null;

  const db = getDb();
  const [inserted] = await db
    .insert(configsTable)
    .values({
      groupId,
      modelId,
      displayName,
      endpoint,
      endpointPath,
      method,
      headers,
      requestBody,
      apiKeyEnc: apiKey ? encryptSecret(apiKey) : null,
      enabled: true,
      isMaintenance: false,
      pollIntervalSeconds: clamp(pollIntervalSeconds, 15, 31536000, adminProbe.intervalSec),
      timeoutMs: clamp(timeoutMs, 1000, 600000, adminProbe.timeoutMs),
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    })
    .returning({ id: configsTable.id });
  await logAudit('config.create', displayName, { method, modelId, groupId });
  // 立即跑一次探测,这样公开页刷新就能看到初始状态而不是 "unknown"
  if (inserted?.id) {
    try {
      const { runOnce } = await import('@/lib/probe/runner');
      const { loadActiveConfigs } = await import('@/lib/probe/load-configs');
      const all = await loadActiveConfigs();
      const found = all.find((x) => x.id === inserted.id);
      if (found) await runOnce(found);
    } catch (err) {
      // 探测失败不阻断创建;探测器后续 tick 会重试
      console.warn(
        `[config.create] initial probe failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  // 用 'layout' scope 让公开页全树缓存失效。
  revalidatePath('/admin/configs');
  revalidatePath('/', 'layout');
}

async function editConfig(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  const groupIdRaw = formData.get('group_id');
  const modelId = Number(formData.get('model_id'));
  const displayName = String(formData.get('display_name') ?? '').trim();
  const method = parseMethodForm(formData);
  const headers = parseHeadersForm(formData);
  const requestBody = parseBodyForm(formData);
  const pollIntervalSeconds = Number(formData.get('poll_interval_seconds') ?? 60);
  const timeoutMs = Number(formData.get('timeout_ms') ?? 30000);
  const sortOrder = Number(formData.get('sort_order') ?? 0);
  const apiKey = String(formData.get('api_key') ?? '').trim();
  const clearApiKey = formData.get('clear_api_key') === 'on';

  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  if (!Number.isFinite(modelId) || modelId <= 0) throw new Error('model_id required');
  if (!displayName) throw new Error('display_name required');
  const { endpoint, endpointPath } = parseEndpointPair(formData);
  if (!endpoint && !endpointPath) {
    throw new Error('endpoint 或 endpointPath 至少填一个');
  }
  const groupId = groupIdRaw && groupIdRaw !== '' ? Number(groupIdRaw) : null;

  const update: Record<string, unknown> = {
    groupId,
    modelId,
    displayName,
    endpoint,
    endpointPath,
    method,
    headers,
    requestBody,
    pollIntervalSeconds: clamp(pollIntervalSeconds, 15, 31536000, 60),
    timeoutMs: clamp(timeoutMs, 1000, 600000, 30000),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    updatedAt: new Date(),
  };
  if (clearApiKey) update.apiKeyEnc = null;
  else if (apiKey) update.apiKeyEnc = encryptSecret(apiKey);

  const db = getDb();
  await db.update(configsTable).set(update).where(eq(configsTable.id, id));
  await logAudit('config.edit', String(id), { displayName, method, groupId });
  revalidatePath('/admin/configs');
  revalidatePath('/');
}

async function deleteConfig(id: number) {
  'use server';
  await requireAdmin();
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const db = getDb();
  await db.delete(configsTable).where(eq(configsTable.id, id));
  await logAudit('config.delete', String(id));
  revalidatePath('/admin/configs');
  revalidatePath('/');
}

async function bulkAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const action = String(formData.get('bulk_action') ?? '');
  const idsRaw = formData.getAll('selected').map((v) => Number(v));
  const ids = idsRaw.filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return;

  const db = getDb();
  switch (action) {
    case 'enable':
      await db.update(configsTable).set({ enabled: true }).where(inArray(configsTable.id, ids));
      break;
    case 'disable':
      await db.update(configsTable).set({ enabled: false }).where(inArray(configsTable.id, ids));
      break;
    case 'maintenance_on':
      await db
        .update(configsTable)
        .set({ isMaintenance: true })
        .where(inArray(configsTable.id, ids));
      break;
    case 'maintenance_off':
      await db
        .update(configsTable)
        .set({ isMaintenance: false })
        .where(inArray(configsTable.id, ids));
      break;
    case 'delete':
      await db.delete(configsTable).where(inArray(configsTable.id, ids));
      break;
    default:
      throw new Error(`unsupported bulk action: ${action}`);
  }
  await logAudit('config.bulk', action, { ids, count: ids.length });
  revalidatePath('/admin/configs');
  revalidatePath('/');
}

async function runNow(cid: number): Promise<{ ok: boolean; throttled?: boolean; message: string }> {
  'use server';
  await requireAdmin();
  if (!Number.isFinite(cid) || cid <= 0) return { ok: false, message: '无效 ID' };
  const { sql } = await import('drizzle-orm');
  const db = getDb();
  const recent = (await db.execute(sql`
    SELECT 1 FROM check_results
    WHERE config_id = ${cid} AND checked_at > NOW() - INTERVAL '30 seconds'
    LIMIT 1
  `)) as unknown as Array<{ '?column?': number }>;
  if (recent.length > 0) {
    await logAudit('config.run_now.throttled', String(cid));
    revalidatePath('/admin/configs');
    return { ok: false, throttled: true, message: '30s 内已探测，请稍后再试' };
  }
  const { runOnce } = await import('@/lib/probe/runner');
  const { loadActiveConfigs } = await import('@/lib/probe/load-configs');
  const all = await loadActiveConfigs();
  const found = all.find((x) => x.id === cid);
  if (!found) return { ok: false, message: '组件未启用或不存在' };
  await runOnce(found);
  await logAudit('config.run_now', String(cid));
  revalidatePath('/admin/configs');
  revalidatePath('/', 'layout');
  return { ok: true, message: '探测完成' };
}

async function runAllNow(): Promise<{
  ok: boolean;
  ran: number;
  throttled: number;
  message: string;
}> {
  'use server';
  await requireAdmin();
  const { sql } = await import('drizzle-orm');
  const { runOnce } = await import('@/lib/probe/runner');
  const { loadActiveConfigs } = await import('@/lib/probe/load-configs');
  const db = getDb();
  const recent = (await db.execute(sql`
    SELECT DISTINCT config_id::int AS config_id FROM check_results
    WHERE checked_at > NOW() - INTERVAL '30 seconds'
  `)) as unknown as Array<{ config_id: number }>;
  const recentSet = new Set(recent.map((r) => Number(r.config_id)));
  const all = await loadActiveConfigs();
  let ran = 0;
  let throttled = 0;
  for (const c of all) {
    if (recentSet.has(c.id)) {
      throttled += 1;
      continue;
    }
    try {
      await runOnce(c);
      ran += 1;
    } catch {
      // continue with other configs
    }
  }
  await logAudit('config.run_all', '', { ran, throttled });
  revalidatePath('/admin/configs');
  revalidatePath('/', 'layout');
  return {
    ok: true,
    ran,
    throttled,
    message: `已探测 ${ran} 个组件${throttled > 0 ? `，${throttled} 个被节流` : ''}`,
  };
}

export default async function ConfigsPage() {
  const [{ groups, models }, configs, settings] = await Promise.all([
    loadGroupsAndModels(),
    loadConfigsAdmin(),
    getSettings(),
  ]);

  return (
    <ConfigsTable
      groups={groups}
      models={models}
      configs={configs}
      probeDefaults={{
        pollIntervalSeconds: settings.probe.intervalSec,
        timeoutMs: settings.probe.timeoutMs,
      }}
      createConfig={createConfig}
      editConfig={editConfig}
      deleteConfig={deleteConfig}
      runNow={runNow}
      runAllNow={runAllNow}
      bulkAction={bulkAction}
    />
  );
}
