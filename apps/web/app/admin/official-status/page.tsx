import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDb, officialStatusMirrors, providers as providersTable } from '@fau/db';
import {
  OfficialStatusMirrorsTable,
  type MirrorTableRow,
  type ProviderOption,
} from '@/components/admin/official-status-mirrors-table';
import { logAudit } from '@/lib/admin/audit';
import { getSettings } from '@/lib/admin/settings';
import { loadMirrorsAdmin } from '@/lib/api/admin-aggregations';
import type { OfficialOverallStatus } from '@/lib/api/official-status-shared';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function validateStatusUrl(s: string): string {
  if (!s) throw new Error('status_url is required');
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error('status_url must be a valid http(s) URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('only http/https allowed');
  }
  return s.replace(/\/+$/, '');
}

function clampInterval(n: number): number {
  if (!Number.isFinite(n)) return 300;
  return Math.max(60, Math.min(3600, Math.floor(n)));
}

function parseProviderId(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const ALLOWED_FEED_KINDS = new Set(['statuspage_v2', 'rss', 'atom']);

function parseFeedKind(raw: FormDataEntryValue | null): 'statuspage_v2' | 'rss' | 'atom' {
  const s = String(raw ?? 'statuspage_v2');
  return (ALLOWED_FEED_KINDS.has(s) ? s : 'statuspage_v2') as 'statuspage_v2' | 'rss' | 'atom';
}

function parseFeedUrl(raw: FormDataEntryValue | null): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error('feed_url must be a valid http(s) URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('only http/https allowed');
  }
  return s.replace(/\/+$/, '');
}

async function createMirror(formData: FormData) {
  'use server';
  await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const statusUrl = validateStatusUrl(String(formData.get('status_url') ?? '').trim());
  const homepage = String(formData.get('homepage') ?? '').trim() || null;
  const syncIntervalSeconds = clampInterval(Number(formData.get('sync_interval_seconds')));
  const sortOrder = Number(formData.get('sort_order') ?? 0) || 0;
  const providerId = parseProviderId(formData.get('provider_id'));
  const feedKind = parseFeedKind(formData.get('feed_kind'));
  const feedUrl = parseFeedUrl(formData.get('feed_url'));
  if (!name) throw new Error('name is required');

  const db = getDb();
  await db.insert(officialStatusMirrors).values({
    name,
    statusUrl,
    homepage,
    providerId,
    feedKind,
    feedUrl,
    syncIntervalSeconds,
    sortOrder,
  });
  await logAudit('official_status_mirror.create', name, { statusUrl, providerId, feedKind });
  revalidatePath('/admin/official-status');
  revalidatePath('/official-status');
}

async function editMirror(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const name = String(formData.get('name') ?? '').trim();
  const statusUrl = validateStatusUrl(String(formData.get('status_url') ?? '').trim());
  const homepage = String(formData.get('homepage') ?? '').trim() || null;
  const syncIntervalSeconds = clampInterval(Number(formData.get('sync_interval_seconds')));
  const sortOrder = Number(formData.get('sort_order') ?? 0) || 0;
  const providerId = parseProviderId(formData.get('provider_id'));
  const feedKind = parseFeedKind(formData.get('feed_kind'));
  const feedUrl = parseFeedUrl(formData.get('feed_url'));
  const enabled = formData.get('enabled') != null;
  if (!name) throw new Error('name is required');

  const db = getDb();
  await db
    .update(officialStatusMirrors)
    .set({
      name,
      statusUrl,
      homepage,
      providerId,
      feedKind,
      feedUrl,
      syncIntervalSeconds,
      sortOrder,
      enabled,
      updatedAt: new Date(),
    })
    .where(eq(officialStatusMirrors.id, id));
  await logAudit('official_status_mirror.edit', String(id), {
    name,
    statusUrl,
    providerId,
    feedKind,
  });
  revalidatePath('/admin/official-status');
  revalidatePath('/official-status');
}

async function deleteMirror(id: number) {
  'use server';
  await requireAdmin();
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const db = getDb();
  await db.delete(officialStatusMirrors).where(eq(officialStatusMirrors.id, id));
  await logAudit('official_status_mirror.delete', String(id));
  revalidatePath('/admin/official-status');
  revalidatePath('/official-status');
}

async function refreshOne(id: number) {
  'use server';
  await requireAdmin();
  const { refreshOfficialStatusByMirror } = await import('@/lib/probe/official-status-fetcher');
  const ok = await refreshOfficialStatusByMirror(id);
  await logAudit('official_status_mirror.refresh', String(id), { ok });
  revalidatePath('/admin/official-status');
  revalidatePath('/official-status');
}

async function refreshAll() {
  'use server';
  await requireAdmin();
  const { refreshAllOfficialStatuses } = await import('@/lib/probe/official-status-fetcher');
  const result = await refreshAllOfficialStatuses({ force: true });
  await logAudit('official_status.manual_refresh', undefined, result);
  revalidatePath('/admin/official-status');
  revalidatePath('/official-status');
}

export default async function AdminOfficialStatusPage() {
  const db = getDb();
  const [overview, providerRows, settings] = await Promise.all([
    loadMirrorsAdmin(),
    db
      .select({ id: providersTable.id, name: providersTable.name, type: providersTable.type })
      .from(providersTable)
      .orderBy(providersTable.id),
    getSettings(),
  ]);
  const rows: MirrorTableRow[] = overview.map((r) => ({
    ...r,
    latestStatus: r.latestStatus as OfficialOverallStatus | null,
  }));
  const providers: ProviderOption[] = providerRows.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type as string,
  }));

  return (
    <OfficialStatusMirrorsTable
      rows={rows}
      providers={providers}
      siteTimezone={settings.site.timezone}
      createMirror={createMirror}
      editMirror={editMirror}
      deleteMirror={deleteMirror}
      refreshOne={refreshOne}
      refreshAll={refreshAll}
    />
  );
}
