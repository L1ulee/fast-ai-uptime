import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { loadEncryptionKey } from './env';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM 推荐 96-bit IV
const TAG_BYTES = 16;
const VERSION = 'v1';

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  _key = loadEncryptionKey();
  return _key;
}

/**
 * 仅用于测试：注入临时密钥，跳过环境变量加载。
 * 切勿在生产代码中调用。
 */
export function __setEncryptionKeyForTesting(key: Buffer | null): void {
  _key = key;
}

/**
 * 加密任意明文字符串。
 * 输出格式： v1:<iv-b64>:<ciphertext-b64>:<tag-b64>
 */
export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== 'string') {
    throw new TypeError('encryptSecret expects a string');
  }
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    ciphertext.toString('base64'),
    tag.toString('base64'),
  ].join(':');
}

/**
 * 解密由 encryptSecret 产生的密文字符串。
 * 失败抛出（认证失败 / 格式错误 / 版本不匹配）。
 */
export function decryptSecret(encoded: string): string {
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new TypeError('decryptSecret expects a non-empty string');
  }
  const parts = encoded.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid ciphertext format: expected v1:iv:ct:tag');
  }
  const [version, ivB64, ctB64, tagB64] = parts as [string, string, string, string];
  if (version !== VERSION) {
    throw new Error(`Unsupported ciphertext version: ${version}`);
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');
  if (iv.length !== IV_BYTES) {
    throw new Error(`Invalid IV length: ${iv.length}`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error(`Invalid auth tag length: ${tag.length}`);
  }
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * 仅展示给管理员的"密钥末 4 位脱敏"。
 */
export function maskSecret(secret: string): string {
  if (!secret) return '';
  const trimmed = secret.trim();
  if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
  return `${'*'.repeat(Math.max(4, trimmed.length - 4))}${trimmed.slice(-4)}`;
}
