/**
 * 探测 Worker 的环境配置（从 process.env 读取，提供合理默认）。
 */

function int(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return def;
  const v = Number.parseInt(raw, 10);
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

export const probeEnv = {
  /** 节点身份（多节点选主用） */
  nodeId: process.env.NODE_ID ?? 'local',
  /** 默认探测间隔（秒），单 config 可覆盖 */
  pollIntervalSeconds: int('POLL_INTERVAL_SECONDS', 60, 15, 600),
  /** 单 tick 内并发上限 */
  checkConcurrency: int('CHECK_CONCURRENCY', 5, 1, 20),
  /** 官方状态镜像间隔（秒） */
  officialStatusIntervalSeconds: int('OFFICIAL_STATUS_INTERVAL_SECONDS', 300, 60, 3600),
  /** 原始结果保留天数 */
  historyRetentionDays: int('HISTORY_RETENTION_DAYS', 30, 7, 365),
  /** 调度 tick 周期（毫秒，写死 5s） */
  schedulerTickMs: 5_000,
  /** 探测租约 TTL（秒） */
  probeLeaseTtlSeconds: 90,
  /** 聚合 cron 周期（毫秒，写死 5min） */
  aggregateIntervalMs: 5 * 60 * 1_000,
  /** 聚合租约 TTL（秒） */
  aggregateLeaseTtlSeconds: 300,
};
