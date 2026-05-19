import { asc, count, desc, eq, inArray, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  checkConfigs as configsTable,
  getDb,
  maintenanceComponents,
  maintenances as maintTable,
} from '@fau/db';
import { MaintenancesTable, type MaintRow } from '@/components/admin/maintenances-table';
import { MAINT_STATUS_OPTIONS as STATUS_OPTIONS } from '@/components/admin/admin-shared';
import { logAudit } from '@/lib/admin/audit';
import { parseDateTimeLocalAsUtc } from '@/lib/admin/datetime';
import { getSettings } from '@/lib/admin/settings';
import { requireAdmin } from '@/lib/auth';
import { enqueueWebhookEvent, type WebhookEvent } from '@/lib/notify/webhook';
import { PAGE_SIZE, parsePage } from '@/components/admin/pagination';

export const dynamic = 'force-dynamic';

async function loadData(pastPage: number) {
  const db = getDb();
  const [upcoming, past, pastTotal, configs] = await Promise.all([
    db
      .select()
      .from(maintTable)
      .where(or(eq(maintTable.status, 'scheduled'), eq(maintTable.status, 'in_progress')))
      .orderBy(asc(maintTable.scheduledStart)),
    db
      .select()
      .from(maintTable)
      .where(or(eq(maintTable.status, 'completed'), eq(maintTable.status, 'cancelled')))
      .orderBy(desc(maintTable.scheduledEnd))
      .limit(PAGE_SIZE)
      .offset((pastPage - 1) * PAGE_SIZE),
    db
      .select({ n: count() })
      .from(maintTable)
      .where(or(eq(maintTable.status, 'completed'), eq(maintTable.status, 'cancelled'))),
    db
      .select({ id: configsTable.id, name: configsTable.displayName })
      .from(configsTable)
      .orderBy(asc(configsTable.displayName)),
  ]);
  const allRows = [...upcoming, ...past];
  if (allRows.length === 0) {
    return {
      upcoming: [] as MaintRow[],
      past: [] as MaintRow[],
      pastTotal: Number(pastTotal[0]?.n ?? 0),
      configs,
    };
  }
  const ids = allRows.map((r) => r.id);
  const comps = await db
    .select({
      maintenanceId: maintenanceComponents.maintenanceId,
      configId: maintenanceComponents.configId,
      name: configsTable.displayName,
    })
    .from(maintenanceComponents)
    .innerJoin(configsTable, eq(maintenanceComponents.configId, configsTable.id))
    .where(inArray(maintenanceComponents.maintenanceId, ids));
  const byMaint = new Map<number, Array<{ configId: number; name: string }>>();
  for (const c of comps) {
    const arr = byMaint.get(c.maintenanceId) ?? [];
    arr.push({ configId: c.configId, name: c.name });
    byMaint.set(c.maintenanceId, arr);
  }
  const enrich = <T extends { id: number }>(
    rows: T[],
  ): Array<T & { affected: Array<{ configId: number; name: string }> }> =>
    rows.map((r) => ({ ...r, affected: byMaint.get(r.id) ?? [] }));
  return {
    upcoming: enrich(upcoming) as unknown as MaintRow[],
    past: enrich(past) as unknown as MaintRow[],
    pastTotal: Number(pastTotal[0]?.n ?? 0),
    configs,
  };
}

async function createMaint(formData: FormData) {
  'use server';
  await requireAdmin();
  const title = String(formData.get('title') ?? '').trim();
  const bodyMd = String(formData.get('body_md') ?? '').trim() || null;
  const startStr = String(formData.get('scheduled_start') ?? '');
  const endStr = String(formData.get('scheduled_end') ?? '');
  const leadRaw = Number(formData.get('notify_lead_minutes') ?? 60);
  const componentIds = formData
    .getAll('component_ids')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!title) throw new Error('title required');
  const start = parseDateTimeLocalAsUtc(startStr);
  const end = parseDateTimeLocalAsUtc(endStr);
  if (Number.isNaN(start.getTime())) throw new Error('scheduled_start invalid');
  if (Number.isNaN(end.getTime())) throw new Error('scheduled_end invalid');
  if (end <= start) throw new Error('scheduled_end must be after scheduled_start');
  const leadMinutes = Number.isFinite(leadRaw) && leadRaw >= 0 ? Math.floor(leadRaw) : 60;

  const db = getDb();
  // 整体事务：插入主表 + 插入关联组件，避免任一失败造成孤立行
  const maintId = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(maintTable)
      .values({
        title,
        bodyMd,
        scheduledStart: start,
        scheduledEnd: end,
        status: 'scheduled',
        notifyLeadMinutes: leadMinutes,
      })
      .returning({ id: maintTable.id });
    const id = inserted[0]!.id;
    if (componentIds.length > 0) {
      await tx
        .insert(maintenanceComponents)
        .values(componentIds.map((configId) => ({ maintenanceId: id, configId })))
        .onConflictDoNothing();
    }
    return id;
  });
  await logAudit('maintenance.create', String(maintId), { title });
  await enqueueWebhookEvent('maintenance.created', {
    id: maintId,
    title,
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
    affectedComponentIds: componentIds,
  });
  revalidatePath('/admin/maintenances');
  revalidatePath('/');
}

async function editMaint(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  const title = String(formData.get('title') ?? '').trim();
  const bodyMd = String(formData.get('body_md') ?? '').trim() || null;
  const startStr = String(formData.get('scheduled_start') ?? '');
  const endStr = String(formData.get('scheduled_end') ?? '');
  const leadRaw = Number(formData.get('notify_lead_minutes') ?? 60);
  const componentIds = formData
    .getAll('component_ids')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  if (!title) throw new Error('title required');
  const start = parseDateTimeLocalAsUtc(startStr);
  const end = parseDateTimeLocalAsUtc(endStr);
  if (Number.isNaN(start.getTime())) throw new Error('scheduled_start invalid');
  if (Number.isNaN(end.getTime())) throw new Error('scheduled_end invalid');
  if (end <= start) throw new Error('scheduled_end must be after scheduled_start');
  const leadMinutes = Number.isFinite(leadRaw) && leadRaw >= 0 ? Math.floor(leadRaw) : 60;

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(maintTable)
      .set({
        title,
        bodyMd,
        scheduledStart: start,
        scheduledEnd: end,
        notifyLeadMinutes: leadMinutes,
        updatedAt: new Date(),
      })
      .where(eq(maintTable.id, id));
    // 替换关联组件：先删后插
    await tx.delete(maintenanceComponents).where(eq(maintenanceComponents.maintenanceId, id));
    if (componentIds.length > 0) {
      await tx
        .insert(maintenanceComponents)
        .values(componentIds.map((configId) => ({ maintenanceId: id, configId })))
        .onConflictDoNothing();
    }
  });
  await logAudit('maintenance.edit', String(id), { title });
  revalidatePath('/admin/maintenances');
  revalidatePath('/');
}

async function setStatus(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  const status = String(formData.get('status') ?? '');
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  if (!STATUS_OPTIONS.includes(status as (typeof STATUS_OPTIONS)[number])) {
    throw new Error('invalid status');
  }
  const db = getDb();
  await db
    .update(maintTable)
    .set({
      status: status as (typeof STATUS_OPTIONS)[number],
      updatedAt: new Date(),
    })
    .where(eq(maintTable.id, id));
  await logAudit('maintenance.set_status', String(id), { status });
  const eventForStatus: Record<string, WebhookEvent | undefined> = {
    in_progress: 'maintenance.started',
    completed: 'maintenance.completed',
    cancelled: 'maintenance.cancelled',
  };
  const event = eventForStatus[status];
  if (event) await enqueueWebhookEvent(event, { id, status });
  revalidatePath('/admin/maintenances');
  revalidatePath('/');
}

async function deleteMaint(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const db = getDb();
  await db.delete(maintTable).where(eq(maintTable.id, id));
  await logAudit('maintenance.delete', String(id));
  await enqueueWebhookEvent('maintenance.deleted', { id });
  revalidatePath('/admin/maintenances');
  revalidatePath('/');
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function MaintenancesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const pastPage = parsePage(sp.page);
  const [{ upcoming, past, pastTotal, configs }, settings] = await Promise.all([
    loadData(pastPage),
    getSettings(),
  ]);

  return (
    <MaintenancesTable
      upcoming={upcoming}
      past={past}
      pastTotal={pastTotal}
      pastPage={pastPage}
      configs={configs}
      siteTimezone={settings.site.timezone}
      createMaint={createMaint}
      editMaint={editMaint}
      setStatus={setStatus}
      deleteMaint={deleteMaint}
    />
  );
}
