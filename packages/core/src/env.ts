// Historical demo values that were once shipped in docker-compose.yml. Reject
// them at startup so an upgrade can't silently keep the predictable secret.
const BANNED_ENCRYPTION_KEYS = new Set([
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
]);

/**
 * ENCRYPTION_KEY: 32 字节 hex（64 字符），生成命令：
 *   openssl rand -hex 32
 */
export function loadEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY is not set. Generate with: openssl rand -hex 32');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      'ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars). ' +
        'Generate with: openssl rand -hex 32',
    );
  }
  if (BANNED_ENCRYPTION_KEYS.has(raw.toLowerCase())) {
    throw new Error('ENCRYPTION_KEY matches a known demo value. Rotate with: openssl rand -hex 32');
  }
  return Buffer.from(raw, 'hex');
}
