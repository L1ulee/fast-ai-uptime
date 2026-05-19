import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import { __setEncryptionKeyForTesting, decryptSecret, encryptSecret, maskSecret } from './crypto';

beforeEach(() => {
  __setEncryptionKeyForTesting(randomBytes(32));
});

afterEach(() => {
  __setEncryptionKeyForTesting(null);
});

test('encryptSecret + decryptSecret round-trip', () => {
  const plaintext = 'sk-proj-abc123-not-a-real-key';
  const encoded = encryptSecret(plaintext);
  assert.ok(encoded.startsWith('v1:'));
  assert.equal(decryptSecret(encoded), plaintext);
});

test('encryptSecret produces non-deterministic ciphertext (random IV)', () => {
  const plaintext = 'ping';
  const a = encryptSecret(plaintext);
  const b = encryptSecret(plaintext);
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), plaintext);
  assert.equal(decryptSecret(b), plaintext);
});

test('decryptSecret rejects tampered ciphertext (auth tag mismatch)', () => {
  const encoded = encryptSecret('hello');
  const parts = encoded.split(':');
  const ct = Buffer.from(parts[2]!, 'base64');
  ct[0] = ct[0]! ^ 0xff; // flip a byte
  parts[2] = ct.toString('base64');
  const tampered = parts.join(':');
  assert.throws(() => decryptSecret(tampered));
});

test('decryptSecret rejects unknown version', () => {
  const encoded = encryptSecret('hello').replace(/^v1:/, 'v9:');
  assert.throws(() => decryptSecret(encoded), /version/);
});

test('decryptSecret rejects malformed input', () => {
  assert.throws(() => decryptSecret(''));
  assert.throws(() => decryptSecret('not:valid:format'));
  assert.throws(() => decryptSecret('v1:short:short:short'));
});

test('decryptSecret with wrong key fails authentication', () => {
  const encoded = encryptSecret('payload');
  __setEncryptionKeyForTesting(randomBytes(32));
  assert.throws(() => decryptSecret(encoded));
});

test('maskSecret keeps last 4 chars and obscures the rest', () => {
  assert.equal(maskSecret('sk-proj-abcdef'), '**********cdef');
  assert.equal(maskSecret('xy'), '**');
  assert.equal(maskSecret(''), '');
});
