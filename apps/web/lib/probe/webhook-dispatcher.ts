import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { safeFetch, SsrfBlockedError } from '@fau/core';
import { getDb, subscriptions, webhookDeliveries } from '@fau/db';
import {
  MAX_ATTEMPTS,
  currentTimestampSec,
  nextRetryDelayMs,
  signWebhookBody,
} from '@/lib/notify/webhook';
import { probeEnv } from './env';
import { releaseLease } from './lease';
import { withLease } from './with-lease';

const LEASE_KEY = 'webhook-dispatcher';
const TICK_MS = 15_000;
const LEASE_TTL_SECONDS = 60;
const BATCH_SIZE = 20;
const HTTP_TIMEOUT_MS = 10_000;

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = false;

interface DueRow {
  id: number;
  subscriptionId: number;
  eventType: string;
  payload: unknown;
  attempts: number;
  target: string | null;
  secret: string | null;
}

async function loadDue(): Promise<DueRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: webhookDeliveries.id,
      subscriptionId: webhookDeliveries.subscriptionId,
      eventType: webhookDeliveries.eventType,
      payload: webhookDeliveries.payload,
      attempts: webhookDeliveries.attempts,
      target: subscriptions.target,
      secret: subscriptions.secret,
    })
    .from(webhookDeliveries)
    .innerJoin(subscriptions, eq(webhookDeliveries.subscriptionId, subscriptions.id))
    .where(
      and(
        eq(webhookDeliveries.status, 'pending'),
        or(isNull(webhookDeliveries.nextRetryAt), lte(webhookDeliveries.nextRetryAt, sql`NOW()`)),
        eq(subscriptions.channel, 'webhook'),
      ),
    )
    .orderBy(asc(webhookDeliveries.id))
    .limit(BATCH_SIZE);
  return rows;
}

async function deliverOne(row: DueRow): Promise<void> {
  if (!row.target) {
    await markFailed(row.id, 'subscription has no target', row.attempts + 1);
    return;
  }
  let url: URL;
  try {
    url = new URL(row.target);
  } catch {
    await markFailed(row.id, `invalid target URL: ${row.target}`, row.attempts + 1);
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    await markFailed(row.id, `unsupported scheme: ${url.protocol}`, row.attempts + 1);
    return;
  }

  const body = JSON.stringify(row.payload);
  const ts = currentTimestampSec();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-fau-event': row.eventType,
    'x-fau-delivery-id': String(row.id),
    'x-fau-timestamp': String(ts),
  };
  if (row.secret) {
    // 签名覆盖 timestamp + body; 接收端应:
    //   1) 比对 timestamp 与当前差值 (e.g. ±5min),拒绝过期请求
    //   2) 重算 HMAC(secret, `${timestamp}.${body}`) 与 x-fau-signature 比对
    headers['x-fau-signature'] = `sha256=${signWebhookBody(row.secret, body, ts)}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let httpStatus = 0;
  let errorMsg: string | null = null;
  const startedAt = Date.now();
  try {
    const res = await safeFetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    httpStatus = res.status;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      errorMsg = `HTTP ${res.status} ${truncate(text, 200)}`;
    }
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      errorMsg = `blocked: ${err.message}`;
    } else {
      errorMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
  } finally {
    clearTimeout(timer);
  }
  const durationMs = Date.now() - startedAt;

  const nextAttempts = row.attempts + 1;
  if (errorMsg === null) {
    await markDelivered(row.id, httpStatus, durationMs);
    return;
  }
  if (nextAttempts >= MAX_ATTEMPTS) {
    await markFailed(
      row.id,
      `${errorMsg} (gave up after ${nextAttempts} attempts)`,
      nextAttempts,
      httpStatus,
      durationMs,
    );
    return;
  }
  const retryAt = new Date(Date.now() + nextRetryDelayMs(nextAttempts));
  await markRetry(row.id, errorMsg, nextAttempts, retryAt, httpStatus, durationMs);
  console.warn(
    `[webhook] retry #${nextAttempts} for delivery ${row.id} (status=${httpStatus}) at ${retryAt.toISOString()}`,
  );
}

async function markDelivered(id: number, httpStatus: number, durationMs: number): Promise<void> {
  await getDb()
    .update(webhookDeliveries)
    .set({
      status: 'delivered',
      deliveredAt: new Date(),
      lastError: null,
      httpStatus,
      durationMs,
    })
    .where(eq(webhookDeliveries.id, id));
}

async function markRetry(
  id: number,
  err: string,
  attempts: number,
  nextRetryAt: Date,
  httpStatus: number,
  durationMs: number,
): Promise<void> {
  await getDb()
    .update(webhookDeliveries)
    .set({
      attempts,
      lastError: truncate(err, 500),
      nextRetryAt,
      httpStatus,
      durationMs,
    })
    .where(eq(webhookDeliveries.id, id));
}

async function markFailed(
  id: number,
  err: string,
  attempts: number,
  httpStatus?: number,
  durationMs?: number,
): Promise<void> {
  const update: Record<string, unknown> = {
    status: 'failed',
    attempts,
    lastError: truncate(err, 500),
    nextRetryAt: null,
  };
  if (httpStatus !== undefined) update.httpStatus = httpStatus;
  if (durationMs !== undefined) update.durationMs = durationMs;
  await getDb().update(webhookDeliveries).set(update).where(eq(webhookDeliveries.id, id));
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

async function tick(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    await withLease(LEASE_KEY, probeEnv.nodeId, LEASE_TTL_SECONDS, async () => {
      const due = await loadDue();
      if (due.length === 0) return;
      // 串行投递，避免对同一目标并发打太多请求
      for (const row of due) {
        if (stopped) break;
        await deliverOne(row);
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[webhook-dispatcher] ${msg}`);
  } finally {
    running = false;
  }
}

export function startWebhookDispatcher(): void {
  if (timer || stopped) return;
  setTimeout(() => {
    if (stopped) return;
    timer = setInterval(() => void tick(), TICK_MS);
    void tick();
  }, 10_000);
  console.log('[webhook-dispatcher] started (tick=15s)');
}

export async function stopWebhookDispatcher(): Promise<void> {
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  try {
    await releaseLease(LEASE_KEY, probeEnv.nodeId);
  } catch {
    // ignore
  }
}
