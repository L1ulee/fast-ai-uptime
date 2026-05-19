export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'custom';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export type CheckStatus = 'ok' | 'degraded' | 'down' | 'timeout';

export type ErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'server_error'
  | 'network'
  | 'timeout'
  | 'invalid_response';

export interface HeaderPair {
  key: string;
  val: string;
}

export interface ProbeConfig {
  /** 完整 endpoint URL（含 scheme/host），调度前已由 load-configs 拼好。 */
  endpoint: string;
  /** HTTP 请求方法。 */
  method: HttpMethod;
  /** API Key（明文）。用于 {{API_KEY}} 模板替换。 */
  apiKey?: string;
  /** 模型名。用于 {{model}} 模板替换。 */
  modelName?: string;
  /** 自定义请求头（按数组顺序传给 fetch）。val 支持 {{API_KEY}} {{model}} {{timestamp}} 模板。 */
  headers?: HeaderPair[];
  /** 自定义请求体（JSON 字符串或纯文本）。同样支持模板。GET/HEAD 时忽略。 */
  body?: string | null;
  /** 超时毫秒。 */
  timeoutMs: number;
}

export interface ProbeResult {
  status: CheckStatus;
  /** 端到端总延迟。 */
  latencyMs?: number;
  /** HEAD/低开销请求的 ping 延迟。 */
  pingMs?: number;
  httpStatus?: number;
  errorKind?: ErrorKind;
  errorMessage?: string;
}
