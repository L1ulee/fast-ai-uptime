import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { assertSafeUrl, SsrfBlockedError } from './safe-fetch';

async function expectBlocked(url: string): Promise<void> {
  await assert.rejects(() => assertSafeUrl(url), SsrfBlockedError, `expected block: ${url}`);
}

test('blocks loopback IPv4 literal', () => expectBlocked('http://127.0.0.1/'));
test('blocks 169.254.169.254 metadata', () => expectBlocked('http://169.254.169.254/'));
test('blocks 10.x', () => expectBlocked('https://10.0.0.5:8080/'));
test('blocks 192.168.x', () => expectBlocked('http://192.168.1.1/'));
test('blocks 172.16-31.x', () => expectBlocked('http://172.20.0.1/'));
test('blocks 0.0.0.0', () => expectBlocked('http://0.0.0.0:3000/'));
test('blocks IPv6 loopback ::1', () => expectBlocked('http://[::1]/'));
test('blocks IPv6 unspecified ::', () => expectBlocked('http://[::]/'));
test('blocks IPv4-mapped dotted ::ffff:127.0.0.1', () =>
  expectBlocked('http://[::ffff:127.0.0.1]/'));
test('blocks IPv4-mapped hex-form ::ffff:7f00:1 (= 127.0.0.1)', () =>
  expectBlocked('http://[::ffff:7f00:1]/'));
test('blocks IPv4-mapped hex-form ::ffff:a9fe:a9fe (= 169.254.169.254)', () =>
  expectBlocked('http://[::ffff:a9fe:a9fe]/'));
test('blocks IPv4-compat ::a.b.c.d', () => expectBlocked('http://[::127.0.0.1]/'));
test('blocks ULA fc00::/7', () => expectBlocked('http://[fc00::1]/'));
test('blocks link-local fe80::', () => expectBlocked('http://[fe80::1]/'));
test('blocks multicast ff00::', () => expectBlocked('http://[ff02::1]/'));
test('blocks non-http scheme', () => expectBlocked('ftp://example.com/'));
test('blocks malformed URL', () => expectBlocked('http://'));
test('SAFE_FETCH_BYPASS_GUARD ignored when NODE_ENV=production', async () => {
  const prevBypass = process.env.SAFE_FETCH_BYPASS_GUARD;
  const prevEnv = process.env.NODE_ENV;
  process.env.SAFE_FETCH_BYPASS_GUARD = '1';
  process.env.NODE_ENV = 'production';
  try {
    await expectBlocked('http://127.0.0.1/');
  } finally {
    if (prevBypass === undefined) delete process.env.SAFE_FETCH_BYPASS_GUARD;
    else process.env.SAFE_FETCH_BYPASS_GUARD = prevBypass;
    if (prevEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
  }
});
