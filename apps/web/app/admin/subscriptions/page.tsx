import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDb, subscriptions, webhookDeliveries } from '@fau/db';
import {
  SubscriptionsTable,
  type DeliveryRow,
  type SubscriptionRow,
  type WebhookKpis,
} from '@/components/admin/subscriptions-table';
import { logAudit } from '@/lib/admin/audit';
import { getSettings } from '@/lib/admin/settings';
import {
  loadRecentDeliveries,
  loadSubscriptionsAdmin,
  loadWebhookKpis,
} from '@/lib/api/admin-aggregations';
import { requireAdmin } from '@/lib/auth';
import { generateWebhookSecret } from '@/lib/notify/webhook';

export const dynamic = 'force-dynamic';

async function loadData(): Promise<{
  subs: SubscriptionRow[];
  recentDeliveries: DeliveryRow[];
  kpis: WebhookKpis;
}> {
  const [subsRaw, deliveriesRaw, kpis] = await Promise.all([
    loadSubscriptionsAdmin(),
    loadRecentDeliveries(20),
    loadWebhookKpis(),
  ]);
  return {
    subs: subsRaw
      .filter((s) => s.channel === 'webhook')
      .map((s) => ({
        id: s.id,
        label: s.label,
        target: s.target,
        secretMask: s.secretMask,
        hasSecret: s.hasSecret,
        channel: s.channel,
        createdAt: s.createdAt,
        eventCount: s.eventCount,
        status: s.status,
      })),
    recentDeliveries: deliveriesRaw.map((d) => ({
      id: d.id,
      subscriptionId: d.subscriptionId,
      subscriptionLabel: d.subscriptionLabel,
      eventType: d.eventType,
      status: d.status,
      httpStatus: d.httpStatus,
      attempts: d.attempts,
      durationMs: d.durationMs,
      lastError: d.lastError,
      deliveredAt: d.deliveredAt,
      createdAt: d.createdAt,
    })),
    kpis,
  };
}

async function createWebhookSubscription(formData: FormData): Promise<{ secret: string }> {
  'use server';
  await requireAdmin();
  const target = String(formData.get('target') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim() || null;
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new Error('target must be a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('only http/https targets are allowed');
  }

  const db = getDb();
  const newSecret = generateWebhookSecret();
  await db.insert(subscriptions).values({
    channel: 'webhook',
    target,
    label,
    secret: newSecret,
    verified: true,
    unsubToken: randomBytes(16).toString('hex'),
  });
  await logAudit('subscription.create', target, { channel: 'webhook' });
  revalidatePath('/admin/subscriptions');
  return { secret: newSecret };
}

async function deleteSubscription(id: number) {
  'use server';
  await requireAdmin();
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const db = getDb();
  await db.delete(subscriptions).where(eq(subscriptions.id, id));
  await logAudit('subscription.delete', String(id));
  revalidatePath('/admin/subscriptions');
}

async function rotateSecret(id: number): Promise<{ secret: string }> {
  'use server';
  await requireAdmin();
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const db = getDb();
  const newSecret = generateWebhookSecret();
  await db.update(subscriptions).set({ secret: newSecret }).where(eq(subscriptions.id, id));
  await logAudit('subscription.rotate_secret', String(id));
  revalidatePath('/admin/subscriptions');
  // 一次性返回新 secret 给客户端 toast;后续刷新只能看到掩码。
  return { secret: newSecret };
}

async function retryDelivery(id: number) {
  'use server';
  await requireAdmin();
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const db = getDb();
  await db
    .update(webhookDeliveries)
    .set({ status: 'pending', nextRetryAt: null, attempts: 0, lastError: null })
    .where(eq(webhookDeliveries.id, id));
  await logAudit('webhook_delivery.retry', String(id));
  revalidatePath('/admin/subscriptions');
}

export default async function SubscriptionsPage() {
  const [{ subs, recentDeliveries, kpis }, settings] = await Promise.all([
    loadData(),
    getSettings(),
  ]);

  return (
    <SubscriptionsTable
      subs={subs}
      recentDeliveries={recentDeliveries}
      kpis={kpis}
      siteTimezone={settings.site.timezone}
      createWebhookSubscription={createWebhookSubscription}
      deleteSubscription={deleteSubscription}
      rotateSecret={rotateSecret}
      retryDelivery={retryDelivery}
    />
  );
}
