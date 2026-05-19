import { createHmac, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb, subscriptions, webhookDeliveries } from '@fau/db';

export type WebhookEvent =
  | 'incident.created'
  | 'incident.updated'
  | 'incident.resolved'
  | 'incident.deleted'
  | 'maintenance.created'
  | 'maintenance.started'
  | 'maintenance.completed'
  | 'maintenance.cancelled'
  | 'maintenance.deleted';

export interface WebhookEnvelope<T = unknown> {
  event: WebhookEvent;
  timestamp: string;
  data: T;
}

/**
 * 给所有已订阅 webhook 的 subscription 入队一条投递记录。
 * 失败仅打日志，不影响主流程。
 */
export async function enqueueWebhookEvent<T>(event: WebhookEvent, data: T): Promise<void> {
  try {
    const db = getDb();
    const subs = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.channel, 'webhook'), eq(subscriptions.verified, true)));
    if (subs.length === 0) return;
    const envelope: WebhookEnvelope<T> = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };
    await db.insert(webhookDeliveries).values(
      subs.map((s) => ({
        subscriptionId: s.id,
        eventType: event,
        payload: envelope as object,
      })),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[webhook] enqueue ${event} failed: ${msg}`);
  }
}

/**
 * 生成 HMAC-SHA256 签名(hex)。
 * 签的是 `${timestamp}.${body}` 而非裸 body —— 让接收端可以拒绝过期 envelope (防重放)。
 * 单位 = unix epoch 秒。
 */
export function signWebhookBody(secret: string, body: string, timestamp: number): string {
  const payload = `${timestamp}.${body}`;
  return createHmac('sha256', Buffer.from(secret, 'utf8')).update(payload).digest('hex');
}

/** 当前 unix 秒 —— 提供给 dispatcher。 */
export function currentTimestampSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** 生成 32 字节 hex 的随机签名密钥。 */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length; // 5 次

export function nextRetryDelayMs(attempts: number): number {
  if (attempts < 1) return RETRY_DELAYS_MS[0]!;
  if (attempts > RETRY_DELAYS_MS.length) {
    return RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
  }
  return RETRY_DELAYS_MS[attempts - 1]!;
}
