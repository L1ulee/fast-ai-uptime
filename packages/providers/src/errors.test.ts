import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { classifyHttpStatus, classifyThrown, redactSecrets, truncate } from './errors';

test('classifyHttpStatus 401/403 → auth/down', () => {
  assert.deepEqual(classifyHttpStatus(401), { errorKind: 'auth', checkStatus: 'down' });
  assert.deepEqual(classifyHttpStatus(403), { errorKind: 'auth', checkStatus: 'down' });
});

test('classifyHttpStatus 429 → rate_limit/degraded', () => {
  assert.deepEqual(classifyHttpStatus(429), {
    errorKind: 'rate_limit',
    checkStatus: 'degraded',
  });
});

test('classifyHttpStatus 5xx → server_error/degraded', () => {
  for (const s of [500, 502, 503, 504]) {
    assert.deepEqual(classifyHttpStatus(s), {
      errorKind: 'server_error',
      checkStatus: 'degraded',
    });
  }
});

test('classifyHttpStatus other 4xx → invalid_response/down', () => {
  for (const s of [400, 404, 405, 422]) {
    assert.deepEqual(classifyHttpStatus(s), {
      errorKind: 'invalid_response',
      checkStatus: 'down',
    });
  }
});

test('classifyThrown AbortError → timeout', () => {
  const err = new DOMException('aborted', 'AbortError');
  const r = classifyThrown(err, 30000);
  assert.equal(r.status, 'timeout');
  assert.equal(r.errorKind, 'timeout');
  assert.equal(r.latencyMs, 30000);
});

test('classifyThrown network error → down/network', () => {
  const err = new TypeError('fetch failed');
  const r = classifyThrown(err, 42);
  assert.equal(r.status, 'down');
  assert.equal(r.errorKind, 'network');
  assert.equal(r.latencyMs, 42);
  assert.match(r.errorMessage ?? '', /fetch failed/);
});

test('redactSecrets masks OpenAI sk- keys', () => {
  const input = 'auth failed: sk-proj-AAAAbbbbCCCCddddEEEE';
  assert.equal(redactSecrets(input), 'auth failed: <redacted>');
});

test('redactSecrets masks Bearer tokens', () => {
  const input = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
  assert.equal(redactSecrets(input), '<redacted>');
});

test('redactSecrets masks x-api-key header values', () => {
  const input = 'x-api-key: sk-ant-api03-abcdefgh1234567890';
  // The pattern starts at "x-api-key:" — entire match replaced
  assert.match(redactSecrets(input), /<redacted>/);
});

test('redactSecrets masks Google AIza keys', () => {
  const input = 'using AIzaSyA-1234567890abcdefghijklmnopqrstu for request';
  assert.match(redactSecrets(input), /<redacted>/);
});

test('redactSecrets masks api_key= / api-key= forms', () => {
  for (const input of [
    'api_key=ABCDEFGH12345678',
    'api-key=ABCDEFGH12345678',
    'API_KEY="ABCDEFGH12345678"',
    'x-api-key: ABCDEFGH12345678',
  ]) {
    assert.match(redactSecrets(input), /<redacted>/, `failed for: ${input}`);
  }
});

test('redactSecrets masks JWT-like tokens', () => {
  const input =
    'token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  assert.match(redactSecrets(input), /token: <redacted>/);
});

test('redactSecrets masks GitHub tokens', () => {
  for (const prefix of ['ghp_', 'gho_', 'ghs_', 'ghu_', 'ghr_']) {
    const input = `using ${prefix}1234567890abcdefABCDEF for auth`;
    assert.match(redactSecrets(input), /<redacted>/, `failed for prefix: ${prefix}`);
  }
});

test('redactSecrets masks access_token forms', () => {
  for (const input of ['access_token=ABCDEF1234567890', 'access-token: "ABCDEF1234567890"']) {
    assert.match(redactSecrets(input), /<redacted>/, `failed for: ${input}`);
  }
});

test('truncate respects max length', () => {
  assert.equal(truncate('hello', 5), 'hello');
  assert.equal(truncate('hello world', 5).length, 5);
  assert.match(truncate('hello world', 5), /…$/);
});
