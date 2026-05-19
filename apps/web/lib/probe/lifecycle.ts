/**
 * Worker 生命周期管理 —— 仅 Node runtime 通过动态 import 进入此文件。
 * 这样 Turbopack 在 Edge runtime 静态分析时不会看到 process.once。
 */
import { startAggregator, stopAggregator } from './aggregator';
import { startIncidentScanner, stopIncidentScanner } from './incident-scanner';
import { startLogCleanup, stopLogCleanup } from './log-cleanup';
import { startMaintenanceScanner, stopMaintenanceScanner } from './maintenance-scanner';
import { startOfficialStatusFetcher, stopOfficialStatusFetcher } from './official-status-fetcher';
import { startScheduler, stopScheduler } from './scheduler';
import { startWebhookDispatcher, stopWebhookDispatcher } from './webhook-dispatcher';

let registered = false;

export function bootWorker(): void {
  if (registered) return;
  registered = true;
  startScheduler();
  startAggregator();
  startMaintenanceScanner();
  startWebhookDispatcher();
  startOfficialStatusFetcher();
  startIncidentScanner();
  startLogCleanup();

  const shutdown = async () => {
    console.log('[probe-worker] shutting down…');
    await Promise.allSettled([
      stopScheduler(),
      stopAggregator(),
      stopMaintenanceScanner(),
      stopWebhookDispatcher(),
      stopOfficialStatusFetcher(),
      stopIncidentScanner(),
      stopLogCleanup(),
    ]);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
