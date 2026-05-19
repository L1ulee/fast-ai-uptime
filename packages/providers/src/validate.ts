import type { HttpMethod, ProbeConfig } from './types';

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);
const ALLOWED_METHODS = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);

export class ProbeConfigError extends Error {
  override readonly name = 'ProbeConfigError';
}

/** 调度入口处的校验。任何不通过都抛出，会被归为 invalid_response。 */
export function assertValidProbeConfig(config: ProbeConfig): void {
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new ProbeConfigError(`timeoutMs must be a positive number, got ${config.timeoutMs}`);
  }
  if (config.timeoutMs > 600_000) {
    throw new ProbeConfigError(`timeoutMs is unreasonably large: ${config.timeoutMs}`);
  }

  let url: URL;
  try {
    url = new URL(config.endpoint);
  } catch {
    throw new ProbeConfigError(`Invalid endpoint URL: ${config.endpoint}`);
  }
  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    throw new ProbeConfigError(`Endpoint scheme not allowed: ${url.protocol}`);
  }

  if (!ALLOWED_METHODS.has(config.method)) {
    throw new ProbeConfigError(`HTTP method not allowed: ${config.method}`);
  }
}
