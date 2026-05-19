import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, test } from 'node:test';
import { probe } from './index';
import { applyTemplate } from './template';
import type { ProbeConfig } from './types';

// Tests mock globalThis.fetch and use synthetic hosts (api.example.com); the
// safe-fetch SSRF guard must skip its DNS+IP checks for those to work offline.
process.env.SAFE_FETCH_BYPASS_GUARD = '1';

// ─── fetch mocking utilities ────────────────────────────────────────

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

interface MockResponse {
  status?: number;
  jsonBody?: unknown;
  textBody?: string;
}

const captured: CapturedRequest[] = [];
let nextResponse: MockResponse = { status: 200, jsonBody: {} };
const realFetch = globalThis.fetch;

function mockFetchOnce(res: MockResponse) {
  nextResponse = res;
}

beforeEach(() => {
  captured.length = 0;
  nextResponse = { status: 200, jsonBody: {} };
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const headers = headersToObject(init?.headers);
    let parsedBody: unknown = undefined;
    if (init?.body && typeof init.body === 'string') {
      try {
        parsedBody = JSON.parse(init.body);
      } catch {
        parsedBody = init.body;
      }
    }
    captured.push({
      url: typeof url === 'string' ? url : url.toString(),
      method: init?.method ?? 'GET',
      headers,
      body: parsedBody,
    });
    const status = nextResponse.status ?? 200;
    const nullBodyStatus = status === 204 || status === 205 || status === 304;
    const bodyText = nullBodyStatus
      ? null
      : nextResponse.jsonBody !== undefined
        ? JSON.stringify(nextResponse.jsonBody)
        : (nextResponse.textBody ?? '');
    return new Response(bodyText, {
      status,
      headers: nullBodyStatus ? {} : { 'content-type': 'application/json' },
    }) as unknown as Response;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function headersToObject(input: HeadersInit | undefined): Record<string, string> {
  if (!input) return {};
  const out: Record<string, string> = {};
  if (input instanceof Headers) {
    input.forEach((v, k) => (out[k.toLowerCase()] = v));
    return out;
  }
  if (Array.isArray(input)) {
    for (const [k, v] of input) out[k.toLowerCase()] = v;
    return out;
  }
  for (const [k, v] of Object.entries(input)) out[k.toLowerCase()] = String(v);
  return out;
}

// ─── tests ──────────────────────────────────────────────────────────

test('applyTemplate replaces API_KEY / model / timestamp', () => {
  const out = applyTemplate('Bearer {{API_KEY}} model={{model}}', {
    apiKey: 'sk-123',
    modelName: 'gpt-4o',
  });
  assert.equal(out, 'Bearer sk-123 model=gpt-4o');
});

test('applyTemplate leaves unknown vars empty', () => {
  assert.equal(applyTemplate('x={{nope}}', {}), 'x=');
});

test('probe POST sends method, headers (templated), body', async () => {
  mockFetchOnce({ status: 200, jsonBody: { ok: true } });
  const config: ProbeConfig = {
    endpoint: 'https://api.example.com/v1/chat/completions',
    method: 'POST',
    apiKey: 'sk-test',
    modelName: 'gpt-4o',
    headers: [
      { key: 'Content-Type', val: 'application/json' },
      { key: 'Authorization', val: 'Bearer {{API_KEY}}' },
    ],
    body: '{"model":"{{model}}","messages":[{"role":"user","content":"ping"}]}',
    timeoutMs: 10_000,
  };
  const result = await probe(config);
  assert.equal(result.status, 'ok');
  assert.equal(captured.length, 1);
  const req = captured[0]!;
  assert.equal(req.method, 'POST');
  assert.equal(req.headers['authorization'], 'Bearer sk-test');
  assert.deepEqual(req.body, { model: 'gpt-4o', messages: [{ role: 'user', content: 'ping' }] });
});

test('probe GET ignores body even if provided', async () => {
  mockFetchOnce({ status: 200, jsonBody: {} });
  const config: ProbeConfig = {
    endpoint: 'https://api.example.com/v1/models',
    method: 'GET',
    apiKey: 'sk-test',
    headers: [{ key: 'Authorization', val: 'Bearer {{API_KEY}}' }],
    body: '{"should":"be ignored"}',
    timeoutMs: 10_000,
  };
  await probe(config);
  assert.equal(captured[0]!.method, 'GET');
  assert.equal(captured[0]!.body, undefined);
});

test('probe HEAD returns ok regardless of HTTP status', async () => {
  mockFetchOnce({ status: 405 });
  const result = await probe({
    endpoint: 'https://api.example.com/health',
    method: 'HEAD',
    timeoutMs: 5_000,
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.httpStatus, 405);
  assert.ok(result.pingMs! > 0);
});

test('probe rejects invalid scheme', async () => {
  const result = await probe({
    endpoint: 'ftp://bad',
    method: 'GET',
    timeoutMs: 5_000,
  });
  assert.equal(result.status, 'down');
  assert.equal(result.errorKind, 'invalid_response');
});

test('probe maps 401 to auth error and status=down', async () => {
  mockFetchOnce({ status: 401, textBody: 'Unauthorized' });
  const result = await probe({
    endpoint: 'https://api.example.com/v1/chat/completions',
    method: 'POST',
    headers: [{ key: 'Authorization', val: 'Bearer bad' }],
    body: '{}',
    timeoutMs: 5_000,
  });
  assert.equal(result.status, 'down');
  assert.equal(result.errorKind, 'auth');
});

test('probe maps 429 to rate_limit / degraded', async () => {
  mockFetchOnce({ status: 429, textBody: 'Too many' });
  const result = await probe({
    endpoint: 'https://api.example.com/v1/chat/completions',
    method: 'POST',
    headers: [],
    body: '{}',
    timeoutMs: 5_000,
  });
  assert.equal(result.errorKind, 'rate_limit');
  assert.equal(result.status, 'degraded');
});
