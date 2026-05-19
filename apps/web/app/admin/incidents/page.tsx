import { asc, count, desc, eq, inArray, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  checkConfigs as configsTable,
  getDb,
  incidentComponents,
  incidentUpdateComponents,
  incidentUpdates,
  incidents as incidentsTable,
} from '@fau/db';
import { IncidentsTable, type IncidentRow } from '@/components/admin/incidents-table';
import { IMPACT_OPTIONS, STATUS_OPTIONS } from '@/components/admin/incidents-shared';
import { logAudit } from '@/lib/admin/audit';
import { getSettings } from '@/lib/admin/settings';
import { requireAdmin } from '@/lib/auth';
import { enqueueWebhookEvent } from '@/lib/notify/webhook';
import { PAGE_SIZE, parsePage } from '@/components/admin/pagination';

export const dynamic = 'force-dynamic';

async function loadData(resolvedPage: number) {
  const db = getDb();
  // 进行中事件全部加载（通常很少）；已解决按页加载
  const [activeRows, resolvedRows, resolvedTotal, configs] = await Promise.all([
    db
      .select()
      .from(incidentsTable)
      .where(ne(incidentsTable.status, 'resolved'))
      .orderBy(desc(incidentsTable.startedAt)),
    db
      .select()
      .from(incidentsTable)
      .where(eq(incidentsTable.status, 'resolved'))
      .orderBy(desc(incidentsTable.resolvedAt))
      .limit(PAGE_SIZE)
      .offset((resolvedPage - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(incidentsTable).where(eq(incidentsTable.status, 'resolved')),
    db
      .select({ id: configsTable.id, name: configsTable.displayName })
      .from(configsTable)
      .orderBy(asc(configsTable.displayName)),
  ]);
  const incRows = [...activeRows, ...resolvedRows];
  if (incRows.length === 0) {
    return {
      activeIncidents: [] as IncidentRow[],
      resolvedIncidents: [] as IncidentRow[],
      resolvedTotal: Number(resolvedTotal[0]?.n ?? 0),
      configs,
    };
  }
  const ids = incRows.map((r) => r.id);
  const [updates, comps, updateComps] = await Promise.all([
    db
      .select()
      .from(incidentUpdates)
      .where(inArray(incidentUpdates.incidentId, ids))
      .orderBy(desc(incidentUpdates.createdAt)),
    db
      .select({
        incidentId: incidentComponents.incidentId,
        configId: incidentComponents.configId,
        name: configsTable.displayName,
      })
      .from(incidentComponents)
      .innerJoin(configsTable, eq(incidentComponents.configId, configsTable.id))
      .where(inArray(incidentComponents.incidentId, ids)),
    db
      .select({
        updateId: incidentUpdateComponents.updateId,
        configId: incidentUpdateComponents.configId,
        name: configsTable.displayName,
      })
      .from(incidentUpdateComponents)
      .innerJoin(incidentUpdates, eq(incidentUpdateComponents.updateId, incidentUpdates.id))
      .innerJoin(configsTable, eq(incidentUpdateComponents.configId, configsTable.id))
      .where(inArray(incidentUpdates.incidentId, ids)),
  ]);
  const updatesByIncident = new Map<number, typeof updates>();
  for (const u of updates) {
    const arr = updatesByIncident.get(u.incidentId) ?? [];
    arr.push(u);
    updatesByIncident.set(u.incidentId, arr);
  }
  const compsByIncident = new Map<number, Array<{ configId: number; name: string }>>();
  for (const c of comps) {
    const arr = compsByIncident.get(c.incidentId) ?? [];
    arr.push({ configId: c.configId, name: c.name });
    compsByIncident.set(c.incidentId, arr);
  }
  const compsByUpdate = new Map<number, Array<{ configId: number; name: string }>>();
  for (const c of updateComps) {
    const arr = compsByUpdate.get(c.updateId) ?? [];
    arr.push({ configId: c.configId, name: c.name });
    compsByUpdate.set(c.updateId, arr);
  }
  const toIso = (d: Date | string | null): string | null =>
    d == null ? null : d instanceof Date ? d.toISOString() : new Date(d).toISOString();
  const enrich = <
    T extends { id: number; startedAt: Date | string; resolvedAt: Date | string | null },
  >(
    rows: T[],
  ): IncidentRow[] =>
    rows.map((r) => {
      const updates = (updatesByIncident.get(r.id) ?? []).map((u) => ({
        id: u.id,
        incidentId: u.incidentId,
        status: u.status,
        impact: u.impact,
        bodyMd: u.bodyMd,
        createdAt: toIso(u.createdAt) ?? new Date().toISOString(),
        affected: compsByUpdate.get(u.id) ?? [],
      }));
      return {
        ...(r as unknown as Omit<IncidentRow, 'updates' | 'affected' | 'startedAt' | 'resolvedAt'>),
        startedAt: toIso(r.startedAt) ?? new Date().toISOString(),
        resolvedAt: toIso(r.resolvedAt),
        updates,
        affected: compsByIncident.get(r.id) ?? [],
      };
    });
  return {
    activeIncidents: enrich(activeRows),
    resolvedIncidents: enrich(resolvedRows),
    resolvedTotal: Number(resolvedTotal[0]?.n ?? 0),
    configs,
  };
}

async function createIncident(formData: FormData) {
  'use server';
  await requireAdmin();
  const title = String(formData.get('title') ?? '').trim();
  const status = String(formData.get('status') ?? 'investigating');
  const impact = String(formData.get('impact') ?? 'minor');
  const isPublic = formData.get('is_public') === 'on';
  const firstUpdate = String(formData.get('first_update') ?? '').trim();
  const componentIds = formData
    .getAll('component_ids')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!title) throw new Error('title required');
  if (!STATUS_OPTIONS.includes(status as (typeof STATUS_OPTIONS)[number])) {
    throw new Error('invalid status');
  }
  if (!IMPACT_OPTIONS.includes(impact as (typeof IMPACT_OPTIONS)[number])) {
    throw new Error('invalid impact');
  }

  const db = getDb();
  // 整体事务：incident + 关联组件 + 首条更新，任一失败全部回滚
  const incidentId = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(incidentsTable)
      .values({
        title,
        status: status as (typeof STATUS_OPTIONS)[number],
        impact: impact as (typeof IMPACT_OPTIONS)[number],
        isPublic,
        resolvedAt: status === 'resolved' ? new Date() : null,
      })
      .returning({ id: incidentsTable.id });
    const id = inserted[0]!.id;
    if (componentIds.length > 0) {
      await tx
        .insert(incidentComponents)
        .values(componentIds.map((configId) => ({ incidentId: id, configId })))
        .onConflictDoNothing();
    }
    if (firstUpdate) {
      const [u] = await tx
        .insert(incidentUpdates)
        .values({
          incidentId: id,
          status: status as (typeof STATUS_OPTIONS)[number],
          impact: impact as (typeof IMPACT_OPTIONS)[number],
          bodyMd: firstUpdate,
        })
        .returning({ id: incidentUpdates.id });
      if (componentIds.length > 0) {
        await tx
          .insert(incidentUpdateComponents)
          .values(componentIds.map((configId) => ({ updateId: u!.id, configId })))
          .onConflictDoNothing();
      }
    }
    return id;
  });
  await logAudit('incident.create', String(incidentId), { title, status, impact });
  await enqueueWebhookEvent('incident.created', {
    id: incidentId,
    title,
    status,
    impact,
    isPublic,
    affectedComponentIds: componentIds,
  });
  revalidatePath('/admin/incidents');
  revalidatePath('/');
}

async function editIncident(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  const title = String(formData.get('title') ?? '').trim();
  const impact = String(formData.get('impact') ?? 'minor');
  const isPublic = formData.get('is_public') === 'on';
  const componentIds = formData
    .getAll('component_ids')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  if (!title) throw new Error('title required');
  if (!IMPACT_OPTIONS.includes(impact as (typeof IMPACT_OPTIONS)[number])) {
    throw new Error('invalid impact');
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(incidentsTable)
      .set({
        title,
        impact: impact as (typeof IMPACT_OPTIONS)[number],
        isPublic,
        updatedAt: new Date(),
      })
      .where(eq(incidentsTable.id, id));
    await tx.delete(incidentComponents).where(eq(incidentComponents.incidentId, id));
    if (componentIds.length > 0) {
      await tx
        .insert(incidentComponents)
        .values(componentIds.map((configId) => ({ incidentId: id, configId })))
        .onConflictDoNothing();
    }
  });
  await logAudit('incident.edit', String(id), { title, impact });
  revalidatePath('/admin/incidents');
  revalidatePath('/');
}

async function addUpdate(formData: FormData) {
  'use server';
  await requireAdmin();
  const incidentId = Number(formData.get('incident_id'));
  const status = String(formData.get('status') ?? '');
  const impact = String(formData.get('impact') ?? 'minor');
  const body = String(formData.get('body') ?? '').trim();
  const componentIds = formData
    .getAll('component_ids')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!Number.isFinite(incidentId) || incidentId <= 0) throw new Error('invalid incident');
  if (!STATUS_OPTIONS.includes(status as (typeof STATUS_OPTIONS)[number])) {
    throw new Error('invalid status');
  }
  if (!IMPACT_OPTIONS.includes(impact as (typeof IMPACT_OPTIONS)[number])) {
    throw new Error('invalid impact');
  }
  if (!body) throw new Error('body required');
  const db = getDb();
  // 单事务：写 update 行（含 impact + 组件快照）+ 同步事件顶层 status/impact
  // + 用本次选择替换 incident_components（最新一条更新即事件当前态）。
  await db.transaction(async (tx) => {
    const [u] = await tx
      .insert(incidentUpdates)
      .values({
        incidentId,
        status: status as (typeof STATUS_OPTIONS)[number],
        impact: impact as (typeof IMPACT_OPTIONS)[number],
        bodyMd: body,
      })
      .returning({ id: incidentUpdates.id });
    if (componentIds.length > 0) {
      await tx
        .insert(incidentUpdateComponents)
        .values(componentIds.map((configId) => ({ updateId: u!.id, configId })))
        .onConflictDoNothing();
    }
    await tx
      .update(incidentsTable)
      .set({
        status: status as (typeof STATUS_OPTIONS)[number],
        impact: impact as (typeof IMPACT_OPTIONS)[number],
        updatedAt: new Date(),
        resolvedAt: status === 'resolved' ? new Date() : null,
      })
      .where(eq(incidentsTable.id, incidentId));
    await tx.delete(incidentComponents).where(eq(incidentComponents.incidentId, incidentId));
    if (componentIds.length > 0) {
      await tx
        .insert(incidentComponents)
        .values(componentIds.map((configId) => ({ incidentId, configId })))
        .onConflictDoNothing();
    }
  });
  await logAudit('incident.update', String(incidentId), { status, impact });
  const event = status === 'resolved' ? 'incident.resolved' : 'incident.updated';
  await enqueueWebhookEvent(event, {
    id: incidentId,
    status,
    body: body.slice(0, 500),
  });
  revalidatePath('/admin/incidents');
  revalidatePath('/');
}

async function editUpdate(formData: FormData) {
  'use server';
  await requireAdmin();
  const updateId = Number(formData.get('update_id'));
  const status = String(formData.get('status') ?? '');
  const impact = String(formData.get('impact') ?? 'minor');
  const body = String(formData.get('body') ?? '').trim();
  const componentIds = formData
    .getAll('component_ids')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!Number.isFinite(updateId) || updateId <= 0) throw new Error('invalid update id');
  if (!STATUS_OPTIONS.includes(status as (typeof STATUS_OPTIONS)[number])) {
    throw new Error('invalid status');
  }
  if (!IMPACT_OPTIONS.includes(impact as (typeof IMPACT_OPTIONS)[number])) {
    throw new Error('invalid impact');
  }
  if (!body) throw new Error('body required');
  const db = getDb();
  let incidentId = 0;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ incidentId: incidentUpdates.incidentId })
      .from(incidentUpdates)
      .where(eq(incidentUpdates.id, updateId))
      .limit(1);
    if (!row) throw new Error('update not found');
    incidentId = row.incidentId;
    await tx
      .update(incidentUpdates)
      .set({
        status: status as (typeof STATUS_OPTIONS)[number],
        impact: impact as (typeof IMPACT_OPTIONS)[number],
        bodyMd: body,
      })
      .where(eq(incidentUpdates.id, updateId));
    await tx
      .delete(incidentUpdateComponents)
      .where(eq(incidentUpdateComponents.updateId, updateId));
    if (componentIds.length > 0) {
      await tx
        .insert(incidentUpdateComponents)
        .values(componentIds.map((configId) => ({ updateId, configId })))
        .onConflictDoNothing();
    }
    // 从最新剩余 update 派生事件当前态;编辑非最新 update 时这就是同值重写 = 无变化
    const [latest] = await tx
      .select()
      .from(incidentUpdates)
      .where(eq(incidentUpdates.incidentId, incidentId))
      .orderBy(desc(incidentUpdates.createdAt))
      .limit(1);
    if (latest) {
      const resolvedAt =
        latest.status === 'resolved'
          ? latest.createdAt instanceof Date
            ? latest.createdAt
            : new Date(latest.createdAt)
          : null;
      await tx
        .update(incidentsTable)
        .set({
          status: latest.status,
          impact: latest.impact,
          updatedAt: new Date(),
          resolvedAt,
        })
        .where(eq(incidentsTable.id, incidentId));
      await tx.delete(incidentComponents).where(eq(incidentComponents.incidentId, incidentId));
      const snap = await tx
        .select({ configId: incidentUpdateComponents.configId })
        .from(incidentUpdateComponents)
        .where(eq(incidentUpdateComponents.updateId, latest.id));
      if (snap.length > 0) {
        await tx
          .insert(incidentComponents)
          .values(snap.map((s) => ({ incidentId, configId: s.configId })))
          .onConflictDoNothing();
      }
    }
  });
  await logAudit('incident.update_edit', String(updateId), { incidentId, status, impact });
  revalidatePath('/admin/incidents');
  revalidatePath('/');
}

async function deleteUpdate(formData: FormData) {
  'use server';
  await requireAdmin();
  const updateId = Number(formData.get('update_id'));
  if (!Number.isFinite(updateId) || updateId <= 0) throw new Error('invalid update id');
  const db = getDb();
  let incidentId = 0;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ incidentId: incidentUpdates.incidentId })
      .from(incidentUpdates)
      .where(eq(incidentUpdates.id, updateId))
      .limit(1);
    if (!row) return;
    incidentId = row.incidentId;
    // incident_update_components 通过 FK ON DELETE CASCADE 自动清理
    await tx.delete(incidentUpdates).where(eq(incidentUpdates.id, updateId));
    const [latest] = await tx
      .select()
      .from(incidentUpdates)
      .where(eq(incidentUpdates.incidentId, incidentId))
      .orderBy(desc(incidentUpdates.createdAt))
      .limit(1);
    if (latest) {
      const resolvedAt =
        latest.status === 'resolved'
          ? latest.createdAt instanceof Date
            ? latest.createdAt
            : new Date(latest.createdAt)
          : null;
      await tx
        .update(incidentsTable)
        .set({
          status: latest.status,
          impact: latest.impact,
          updatedAt: new Date(),
          resolvedAt,
        })
        .where(eq(incidentsTable.id, incidentId));
      await tx.delete(incidentComponents).where(eq(incidentComponents.incidentId, incidentId));
      const snap = await tx
        .select({ configId: incidentUpdateComponents.configId })
        .from(incidentUpdateComponents)
        .where(eq(incidentUpdateComponents.updateId, latest.id));
      if (snap.length > 0) {
        await tx
          .insert(incidentComponents)
          .values(snap.map((s) => ({ incidentId, configId: s.configId })))
          .onConflictDoNothing();
      }
    }
    // 若一条 update 都不剩,事件元信息保留原状(不重置)
  });
  await logAudit('incident.update_delete', String(updateId), { incidentId });
  revalidatePath('/admin/incidents');
  revalidatePath('/');
}

async function bulkDeleteIncidents(formData: FormData) {
  'use server';
  await requireAdmin();
  const ids = formData
    .getAll('selected')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return;
  const db = getDb();
  await db.delete(incidentsTable).where(inArray(incidentsTable.id, ids));
  await logAudit('incident.bulk_delete', undefined, { ids });
  for (const id of ids) await enqueueWebhookEvent('incident.deleted', { id });
  revalidatePath('/admin/incidents');
  revalidatePath('/');
}

/**
 * 批量编辑：仅修改被显式设置的字段（status / impact / is_public），"不修改"项跳过。
 * 定位为管理员批量订正工具 —— 不生成 incident_updates 行。
 */
async function bulkEditIncidents(formData: FormData) {
  'use server';
  await requireAdmin();
  const ids = formData
    .getAll('selected')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return;
  const statusRaw = String(formData.get('status') ?? '');
  const impactRaw = String(formData.get('impact') ?? '');
  const isPublicRaw = String(formData.get('is_public') ?? '');
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (STATUS_OPTIONS.includes(statusRaw as (typeof STATUS_OPTIONS)[number])) {
    patch.status = statusRaw;
    patch.resolvedAt = statusRaw === 'resolved' ? new Date() : null;
  }
  if (IMPACT_OPTIONS.includes(impactRaw as (typeof IMPACT_OPTIONS)[number])) {
    patch.impact = impactRaw;
  }
  if (isPublicRaw === 'true' || isPublicRaw === 'false') {
    patch.isPublic = isPublicRaw === 'true';
  }
  // 仅剩 updatedAt → 没有实际改动
  if (Object.keys(patch).length === 1) return;
  const db = getDb();
  await db.update(incidentsTable).set(patch).where(inArray(incidentsTable.id, ids));
  await logAudit('incident.bulk_edit', undefined, { ids, patch });
  revalidatePath('/admin/incidents');
  revalidatePath('/');
}

async function deleteIncident(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const db = getDb();
  await db.delete(incidentsTable).where(eq(incidentsTable.id, id));
  await logAudit('incident.delete', String(id));
  await enqueueWebhookEvent('incident.deleted', { id });
  revalidatePath('/admin/incidents');
  revalidatePath('/');
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function IncidentsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const resolvedPage = parsePage(sp.page);
  const [{ activeIncidents, resolvedIncidents, resolvedTotal, configs }, settings] =
    await Promise.all([loadData(resolvedPage), getSettings()]);

  return (
    <IncidentsTable
      activeIncidents={activeIncidents}
      resolvedIncidents={resolvedIncidents}
      resolvedTotal={resolvedTotal}
      resolvedPage={resolvedPage}
      configs={configs}
      siteTimezone={settings.site.timezone}
      createIncident={createIncident}
      editIncident={editIncident}
      addUpdate={addUpdate}
      editUpdate={editUpdate}
      deleteUpdate={deleteUpdate}
      deleteIncident={deleteIncident}
      bulkDeleteIncidents={bulkDeleteIncidents}
      bulkEditIncidents={bulkEditIncidents}
    />
  );
}
