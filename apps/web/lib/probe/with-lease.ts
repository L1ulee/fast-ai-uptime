import { acquireLease } from './lease';

/**
 * 带租约执行回调，并在执行期间周期性续租（每 TTL/2 秒一次）。
 * 这样即使回调耗时超过 TTL，也不会出现"租约中飞过期、其它节点抢占"的窗口。
 *
 * 返回值：
 * - 拿到租约且 fn 完成：fn 的返回值
 * - 没拿到租约：null（不执行 fn）
 */
export async function withLease<T>(
  leaseKey: string,
  nodeId: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const got = await acquireLease(leaseKey, nodeId, ttlSeconds);
  if (!got) return null;

  // 半 TTL 续租；unref 让 timer 不阻塞进程退出
  const renewMs = Math.floor((ttlSeconds * 1000) / 2);
  const renewer = setInterval(() => {
    acquireLease(leaseKey, nodeId, ttlSeconds).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[probe-worker] lease renew failed for ${leaseKey}: ${msg}`);
    });
  }, renewMs);
  renewer.unref?.();

  try {
    return await fn();
  } finally {
    clearInterval(renewer);
  }
}
