import type { CheckStatus, ErrorKind, ProbeResult } from './types';

/**
 * 根据 HTTP 状态码判定错误类型。
 * - 401/403 → auth（密钥问题，需运维介入；归类 down）
 * - 429    → rate_limit（限流，归类 degraded）
 * - 5xx    → server_error（上游故障，归类 degraded）
 * - 其它 4xx → invalid_response（请求构造错误；归类 down）
 */
export function classifyHttpStatus(status: number): {
  errorKind: ErrorKind;
  checkStatus: CheckStatus;
} {
  if (status === 401 || status === 403) {
    return { errorKind: 'auth', checkStatus: 'down' };
  }
  if (status === 429) {
    return { errorKind: 'rate_limit', checkStatus: 'degraded' };
  }
  if (status >= 500) {
    return { errorKind: 'server_error', checkStatus: 'degraded' };
  }
  return { errorKind: 'invalid_response', checkStatus: 'down' };
}

/**
 * 把抛出的 fetch / abort 错误归一为 ProbeResult。
 */
export function classifyThrown(err: unknown, latencyMs?: number): ProbeResult {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return {
      status: 'timeout',
      latencyMs,
      errorKind: 'timeout',
      errorMessage: 'Request aborted (timeout)',
    };
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return {
      status: 'timeout',
      latencyMs,
      errorKind: 'timeout',
      errorMessage: 'Request aborted (timeout)',
    };
  }
  // node fetch 网络错误形如 TypeError: fetch failed (cause: ...)
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return {
    status: 'down',
    latencyMs,
    errorKind: 'network',
    errorMessage: redactSecrets(message),
  };
}

const SECRET_PATTERNS = [
  // Provider-specific prefixes
  /sk-[A-Za-z0-9_\-]{8,}/g, // OpenAI / Anthropic
  /AIza[0-9A-Za-z_\-]{20,}/g, // Google
  // GitHub tokens
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  // JWTs
  /eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}/g,
  // Header & query forms (capture key + value, replace whole match)
  /Bearer\s+[A-Za-z0-9_\-.]{8,}/gi,
  /\b(?:x-)?api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9_\-.]{8,}["']?/gi,
  /\baccess[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_\-.]{8,}["']?/gi,
  /\bAuthorization\s*:\s*(?:Api-Key|Token)\s+[A-Za-z0-9_\-.]{8,}/gi,
];

/** 错误信息脱敏：常见 token 形态前缀替换为 ****。 */
export function redactSecrets(input: string): string {
  let out = input;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, '<redacted>');
  }
  return out;
}

/** 错误消息截断（避免上游回包过长撑爆 DB 列）。 */
export function truncate(input: string, max = 200): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1)}…`;
}
