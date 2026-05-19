import { desc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { announcements as annTable, getDb } from '@fau/db';
import { AnnouncementsTable, type AnnouncementRow } from '@/components/admin/announcements-table';
import { LEVEL_OPTIONS, type AnnLevel } from '@/components/admin/admin-shared';
import { logAudit } from '@/lib/admin/audit';
import { parseDateTimeLocalAsUtc } from '@/lib/admin/datetime';
import { getSettings } from '@/lib/admin/settings';
import { requireAdmin } from '@/lib/auth';
import { PAGE_SIZE, parsePage } from '@/components/admin/pagination';

export const dynamic = 'force-dynamic';

async function loadAnnouncements(): Promise<Array<typeof annTable.$inferSelect>> {
  const db = getDb();
  return db.select().from(annTable).orderBy(desc(annTable.startsAt));
}

async function createAnnouncement(formData: FormData) {
  'use server';
  await requireAdmin();
  const bodyMd = String(formData.get('body_md') ?? '').trim();
  const level = String(formData.get('level') ?? 'info');
  const endsAtStr = String(formData.get('ends_at') ?? '');
  const startsAtStr = String(formData.get('starts_at') ?? '');
  const enabled = formData.get('enabled') === 'on';
  if (!bodyMd) throw new Error('body required');
  if (!LEVEL_OPTIONS.includes(level as AnnLevel)) {
    throw new Error('invalid level');
  }
  let endsAt: Date | null = null;
  if (endsAtStr) {
    const d = parseDateTimeLocalAsUtc(endsAtStr);
    if (Number.isNaN(d.getTime())) throw new Error('ends_at invalid');
    endsAt = d;
  }
  let startsAt: Date | undefined;
  if (startsAtStr) {
    const d = parseDateTimeLocalAsUtc(startsAtStr);
    if (!Number.isNaN(d.getTime())) startsAt = d;
  }
  const db = getDb();
  await db.insert(annTable).values({
    bodyMd,
    level: level as AnnLevel,
    endsAt,
    startsAt,
    enabled,
  });
  await logAudit('announcement.create', undefined, { level });
  revalidatePath('/admin/announcements');
  revalidatePath('/');
}

async function editAnnouncement(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  const bodyMd = String(formData.get('body_md') ?? '').trim();
  const level = String(formData.get('level') ?? 'info');
  const endsAtStr = String(formData.get('ends_at') ?? '');
  const startsAtStr = String(formData.get('starts_at') ?? '');
  const enabled = formData.get('enabled') === 'on';
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  if (!bodyMd) throw new Error('body required');
  if (!LEVEL_OPTIONS.includes(level as AnnLevel)) {
    throw new Error('invalid level');
  }
  let endsAt: Date | null = null;
  if (endsAtStr) {
    const d = parseDateTimeLocalAsUtc(endsAtStr);
    if (Number.isNaN(d.getTime())) throw new Error('ends_at invalid');
    endsAt = d;
  }
  const update: Record<string, unknown> = {
    bodyMd,
    level: level as AnnLevel,
    endsAt,
    enabled,
  };
  if (startsAtStr) {
    const d = parseDateTimeLocalAsUtc(startsAtStr);
    if (Number.isNaN(d.getTime())) throw new Error('starts_at invalid');
    update.startsAt = d;
  }
  const db = getDb();
  await db.update(annTable).set(update).where(eq(annTable.id, id));
  await logAudit('announcement.edit', String(id), { level });
  revalidatePath('/admin/announcements');
  revalidatePath('/');
}

async function toggleEnabled(id: number) {
  'use server';
  await requireAdmin();
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const db = getDb();
  // 单条 SQL 原子翻转，避免 read-modify-write 双击竞争
  const updated = (await db.execute(sql`
    UPDATE announcements SET enabled = NOT enabled
    WHERE id = ${id}
    RETURNING enabled
  `)) as unknown as Array<{ enabled: boolean }>;
  if (updated.length === 0) return;
  await logAudit('announcement.toggle_enabled', String(id), {
    newValue: updated[0]!.enabled,
  });
  revalidatePath('/admin/announcements');
  revalidatePath('/');
}

async function deleteAnnouncement(id: number) {
  'use server';
  await requireAdmin();
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const db = getDb();
  await db.delete(annTable).where(eq(annTable.id, id));
  await logAudit('announcement.delete', String(id));
  revalidatePath('/admin/announcements');
  revalidatePath('/');
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function AnnouncementsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const inactivePage = parsePage(sp.page);
  const [rows, settings] = await Promise.all([loadAnnouncements(), getSettings()]);
  const now = Date.now();
  const isActive = (r: (typeof rows)[number]): boolean => {
    if (!r.enabled) return false;
    if (new Date(r.startsAt).getTime() > now) return false;
    if (r.endsAt && new Date(r.endsAt).getTime() <= now) return false;
    return true;
  };

  const toRow = (r: (typeof rows)[number]): AnnouncementRow => ({
    id: r.id,
    bodyMd: r.bodyMd,
    level: r.level as AnnLevel,
    startsAt:
      r.startsAt instanceof Date ? r.startsAt.toISOString() : new Date(r.startsAt).toISOString(),
    endsAt: r.endsAt
      ? r.endsAt instanceof Date
        ? r.endsAt.toISOString()
        : new Date(r.endsAt).toISOString()
      : null,
    enabled: r.enabled,
  });

  const active = rows.filter(isActive).map(toRow);
  const allInactive = rows.filter((r) => !isActive(r));
  const inactiveTotal = allInactive.length;
  const inactive = allInactive
    .slice((inactivePage - 1) * PAGE_SIZE, inactivePage * PAGE_SIZE)
    .map(toRow);

  return (
    <AnnouncementsTable
      active={active}
      inactive={inactive}
      inactiveTotal={inactiveTotal}
      inactivePage={inactivePage}
      siteTimezone={settings.site.timezone}
      createAnnouncement={createAnnouncement}
      editAnnouncement={editAnnouncement}
      toggleEnabled={toggleEnabled}
      deleteAnnouncement={deleteAnnouncement}
    />
  );
}
