import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDb, groups as groupsTable } from '@fau/db';
import { GroupsTable } from '@/components/admin/groups-table';
import { logAudit } from '@/lib/admin/audit';
import { loadGroupsAdmin } from '@/lib/api/admin-aggregations';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function validateSlug(s: string): string {
  if (!/^[a-z0-9_-]+$/.test(s)) {
    throw new Error('slug 仅允许小写字母 / 数字 / - _');
  }
  return s;
}

async function createGroup(formData: FormData) {
  'use server';
  await requireAdmin();
  const slug = validateSlug(
    String(formData.get('slug') ?? '')
      .trim()
      .toLowerCase(),
  );
  const displayName = String(formData.get('display_name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const sortOrder = Number(formData.get('sort_order') ?? 0);
  if (!displayName) throw new Error('display_name required');
  const db = getDb();
  await db.insert(groupsTable).values({
    slug,
    displayName,
    description,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
  });
  await logAudit('group.create', slug);
  revalidatePath('/admin/groups');
  revalidatePath('/');
}

async function editGroup(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = Number(formData.get('id'));
  const slug = validateSlug(
    String(formData.get('slug') ?? '')
      .trim()
      .toLowerCase(),
  );
  const displayName = String(formData.get('display_name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const sortOrder = Number(formData.get('sort_order') ?? 0);
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  if (!displayName) throw new Error('display_name required');
  const db = getDb();
  await db
    .update(groupsTable)
    .set({
      slug,
      displayName,
      description,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    })
    .where(eq(groupsTable.id, id));
  await logAudit('group.edit', String(id), { slug });
  revalidatePath('/admin/groups');
  revalidatePath('/');
}

async function deleteGroup(id: number) {
  'use server';
  await requireAdmin();
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const db = getDb();
  await db.delete(groupsTable).where(eq(groupsTable.id, id));
  await logAudit('group.delete', String(id));
  revalidatePath('/admin/groups');
  revalidatePath('/');
}

export default async function GroupsPage() {
  const rows = await loadGroupsAdmin();
  return (
    <GroupsTable
      rows={rows}
      createGroup={createGroup}
      editGroup={editGroup}
      deleteGroup={deleteGroup}
    />
  );
}
