import { checkResults, getDb } from '@fau/db';
import { probe, redactSecrets, truncate } from '@fau/providers';
import type { LoadedConfig } from './load-configs';

/**
 * 单次执行：探测 → 写一条 check_results。
 * 不抛出（probe 调度器内部已兜住所有异常）。
 */
export async function runOnce(loaded: LoadedConfig, region: string = 'default'): Promise<void> {
  const result = await probe(loaded.probe);
  const db = getDb();
  await db.insert(checkResults).values({
    configId: loaded.id,
    status: result.status,
    latencyMs: result.latencyMs,
    pingMs: result.pingMs,
    httpStatus: result.httpStatus,
    errorKind: result.errorKind,
    errorMessage: result.errorMessage ? truncate(redactSecrets(result.errorMessage)) : undefined,
    region,
    checkedAt: new Date(),
  });
}
