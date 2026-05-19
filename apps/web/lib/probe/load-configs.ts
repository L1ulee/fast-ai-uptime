import { and, eq } from 'drizzle-orm';
import { decryptSecret } from '@fau/core';
import { checkConfigs, getDb, models, providers } from '@fau/db';
import type { HeaderPair, HttpMethod, ProbeConfig } from '@fau/providers';
import { getSettings } from '@/lib/admin/settings';

export interface LoadedConfig {
  /** 数据库主键 */
  id: number;
  /** 当前 tick 用于 probe() 的输入 */
  probe: ProbeConfig;
  /** 该配置的轮询间隔（秒） */
  pollIntervalSeconds: number;
}

/**
 * 加载所有启用且非维护中的探测配置，并解密 api_key。
 *
 * endpoint：component.endpoint（覆盖）> provider.baseUrl + endpointPath
 * apiKey：  component.api_key_enc（覆盖）> provider.api_key_enc
 * method / headers / body 完全由用户在 UI 配置；未填则交由 probe 默认行为。
 */
export async function loadActiveConfigs(): Promise<LoadedConfig[]> {
  const db = getDb();
  // Admin 设置的 User-Agent —— 若 per-config headers 没显式覆盖,自动注入。
  const settings = await getSettings();
  const defaultUA = settings.probe.userAgent || '';
  const rows = await db
    .select({
      id: checkConfigs.id,
      endpoint: checkConfigs.endpoint,
      endpointPath: checkConfigs.endpointPath,
      method: checkConfigs.method,
      apiKeyEnc: checkConfigs.apiKeyEnc,
      headers: checkConfigs.headers,
      requestBody: checkConfigs.requestBody,
      timeoutMs: checkConfigs.timeoutMs,
      pollIntervalSeconds: checkConfigs.pollIntervalSeconds,
      providerType: providers.type,
      providerBaseUrl: providers.baseUrl,
      providerApiKeyEnc: providers.apiKeyEnc,
      modelName: models.modelName,
    })
    .from(checkConfigs)
    .innerJoin(models, eq(checkConfigs.modelId, models.id))
    .innerJoin(providers, eq(models.providerId, providers.id))
    .where(and(eq(checkConfigs.enabled, true), eq(checkConfigs.isMaintenance, false)));

  const out: LoadedConfig[] = [];
  for (const r of rows) {
    const endpoint = resolveEndpoint(r.endpoint, r.providerBaseUrl, r.endpointPath);
    if (!endpoint) {
      console.warn(
        `[probe-worker] config ${r.id} (${r.providerType}/${r.modelName}): ` +
          `endpoint cannot be resolved (need either full endpoint OR provider.baseUrl + endpointPath); skipping`,
      );
      continue;
    }

    const encrypted = r.apiKeyEnc ?? r.providerApiKeyEnc;
    let apiKey: string | undefined;
    if (encrypted) {
      const decrypted = safeDecrypt(encrypted);
      if (decrypted === undefined) {
        console.warn(
          `[probe-worker] config ${r.id} (${r.providerType}/${r.modelName}): ` +
            `api_key decryption failed, skipping until reconfigured`,
        );
        continue;
      }
      apiKey = decrypted;
    }

    const method = normalizeMethod(r.method);
    const headers = withDefaultUserAgent(parseHeaderPairs(r.headers), defaultUA);
    const body = parseBody(r.requestBody);

    const probe: ProbeConfig = {
      endpoint,
      method,
      modelName: r.modelName,
      apiKey,
      headers,
      body,
      timeoutMs: r.timeoutMs,
    };
    out.push({ id: r.id, probe, pollIntervalSeconds: r.pollIntervalSeconds });
  }
  return out;
}

/** Compose the final URL: component.endpoint override → provider.baseUrl + endpointPath. */
function resolveEndpoint(
  componentEndpoint: string | null,
  baseUrl: string | null,
  endpointPath: string | null,
): string | null {
  if (componentEndpoint) return componentEndpoint;
  if (!baseUrl || !endpointPath) return null;
  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const trimmedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return `${trimmedBase}${trimmedPath}`;
}

const ALLOWED_METHODS = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);
function normalizeMethod(input: unknown): HttpMethod {
  const m = typeof input === 'string' ? (input.toUpperCase() as HttpMethod) : 'POST';
  return ALLOWED_METHODS.has(m) ? m : 'POST';
}

/**
 * Headers are stored either as the new design's array of `{key,val}` pairs
 * (preferred), or as a legacy `Record<string,string>` for old rows. Either way
 * the runtime delivers `HeaderPair[]`.
 */
function parseHeaderPairs(value: unknown): HeaderPair[] | undefined {
  if (Array.isArray(value)) {
    const out: HeaderPair[] = [];
    for (const item of value) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).key === 'string'
      ) {
        const v = (item as Record<string, unknown>).val;
        out.push({
          key: (item as Record<string, unknown>).key as string,
          val: typeof v === 'string' ? v : '',
        });
      }
    }
    return out.length > 0 ? out : undefined;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: HeaderPair[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string') out.push({ key: k, val: v });
    }
    return out.length > 0 ? out : undefined;
  }
  return undefined;
}

/** 若 user-defined headers 未含 User-Agent,补一条 admin 默认值;否则尊重用户。 */
function withDefaultUserAgent(
  user: HeaderPair[] | undefined,
  defaultUA: string,
): HeaderPair[] | undefined {
  if (!defaultUA) return user;
  const existing = user ?? [];
  const hasUA = existing.some((h) => (h.key ?? '').toLowerCase() === 'user-agent');
  if (hasUA) return existing.length > 0 ? existing : undefined;
  return [...existing, { key: 'User-Agent', val: defaultUA }];
}

function parseBody(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function safeDecrypt(encoded: string): string | undefined {
  try {
    return decryptSecret(encoded);
  } catch {
    return undefined;
  }
}
