import { createHash } from 'node:crypto';

/**
 * 计算稳定的 ETag。
 * 输入应已经过 JSON.stringify。
 */
export function computeEtag(serialized: string): string {
  const hash = createHash('sha1').update(serialized).digest('base64url');
  return `W/"${hash}"`;
}
