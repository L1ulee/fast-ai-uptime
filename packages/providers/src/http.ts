import { safeFetch, SsrfBlockedError } from '@fau/core';
import { classifyHttpStatus, classifyThrown, redactSecrets, truncate } from './errors';
import { applyTemplate, type TemplateContext } from './template';
import type { HeaderPair, HttpMethod, ProbeResult } from './types';

/** Methods that may not carry a request body. */
const BODYLESS_METHODS = new Set<HttpMethod>(['GET', 'HEAD']);

/**
 * 通用 HTTP 探测：根据 method / 自定义 headers / body 发起请求并归一错误码。
 *
 * 上层 probe() 在调用前已模板替换 endpoint，本函数负责对 headers / body
 * 做相同的替换，并把 {{API_KEY}} {{model}} {{timestamp}} 解析掉。
 */
export interface GenericProbeArgs {
  url: string;
  method: HttpMethod;
  headers?: HeaderPair[];
  body?: string | null;
  timeoutMs: number;
  ctx: TemplateContext;
}

export async function probeHttp(args: GenericProbeArgs): Promise<ProbeResult> {
  const { url, method, headers, body, timeoutMs, ctx } = args;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  let httpStatus: number | undefined;

  // Resolve headers; later entries with the same key override earlier ones.
  const headerInit: Record<string, string> = {};
  if (headers) {
    for (const h of headers) {
      const key = (h.key ?? '').trim();
      if (!key) continue;
      headerInit[key] = applyTemplate(h.val ?? '', ctx);
    }
  }

  const wantsBody = !BODYLESS_METHODS.has(method);
  let resolvedBody: string | undefined;
  if (wantsBody && body != null && body !== '') {
    resolvedBody = applyTemplate(body, ctx);
  }

  try {
    const res = await safeFetch(url, {
      method,
      headers: headerInit,
      body: resolvedBody,
      signal: controller.signal,
    });
    httpStatus = res.status;
    const latencyMs = roundLatency(startedAt);

    // For HEAD we only care that the server responded; ANY status counts as ok.
    if (method === 'HEAD') {
      return { status: 'ok', latencyMs, pingMs: latencyMs, httpStatus };
    }

    if (!res.ok) {
      const text = await safeText(res);
      const { errorKind, checkStatus } = classifyHttpStatus(res.status);
      return {
        status: checkStatus,
        latencyMs,
        httpStatus,
        errorKind,
        errorMessage: truncate(redactSecrets(text || res.statusText)),
      };
    }

    // Best-effort body drain (consume so the connection can be reused).
    await res.arrayBuffer().catch(() => undefined);
    return { status: 'ok', latencyMs, httpStatus };
  } catch (err) {
    const latencyMs = roundLatency(startedAt);
    if (err instanceof SsrfBlockedError) {
      return {
        status: 'down',
        latencyMs,
        httpStatus,
        errorKind: 'invalid_response',
        errorMessage: truncate(redactSecrets(err.message)),
      };
    }
    return { ...classifyThrown(err, latencyMs), httpStatus };
  } finally {
    clearTimeout(timer);
  }
}

function roundLatency(startedAt: number): number {
  return Math.max(1, Math.round(performance.now() - startedAt));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
