import { redactSecrets, truncate } from './errors';
import { probeHttp } from './http';
import type { ProbeConfig, ProbeResult } from './types';
import { assertValidProbeConfig, ProbeConfigError } from './validate';

export type {
  CheckStatus,
  ErrorKind,
  HeaderPair,
  HttpMethod,
  ProbeConfig,
  ProbeResult,
  ProviderType,
} from './types';

export { probeHttp } from './http';
export { applyTemplate } from './template';
export type { TemplateContext } from './template';
export { redactSecrets, truncate, classifyHttpStatus, classifyThrown } from './errors';
export { ProbeConfigError, assertValidProbeConfig } from './validate';

/**
 * 探测调度入口：所有组件统一使用通用 HTTP 探测。
 * 管理员在 UI 上自定义 method / headers / body；本函数仅做校验 + 模板替换 + fetch。
 *
 * 任何抛出（配置非法、模板异常）都会被归一为 ProbeResult，避免逃逸。
 */
export async function probe(config: ProbeConfig): Promise<ProbeResult> {
  try {
    assertValidProbeConfig(config);
    return await probeHttp({
      url: config.endpoint,
      method: config.method,
      headers: config.headers,
      body: config.body,
      timeoutMs: config.timeoutMs,
      ctx: { apiKey: config.apiKey, modelName: config.modelName },
    });
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    // Config 校验失败 → invalid_response（配置错误）；其他异常（模板解析等）→ network。
    const errorKind = err instanceof ProbeConfigError ? 'invalid_response' : 'network';
    return {
      status: 'down',
      latencyMs: 1,
      errorKind,
      errorMessage: truncate(redactSecrets(message)),
    };
  }
}
