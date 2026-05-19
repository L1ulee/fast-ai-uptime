/**
 * Next.js instrumentation 钩子。
 * 进程启动时调用一次（每个 Node worker 各一次；多节点部署时由 DB 租约选主）。
 *
 * 仅在 nodejs runtime 启动 worker；具体逻辑在 lib/probe/lifecycle 内，
 * 通过动态 import 加载，避免 Turbopack 在 Edge runtime 误报 process.once。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.PROBE_DISABLED === '1') {
    console.log('[probe-worker] disabled via PROBE_DISABLED=1');
    return;
  }
  const { bootWorker } = await import('./lib/probe/lifecycle');
  bootWorker();
}
