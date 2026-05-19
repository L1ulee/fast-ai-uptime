import { sql } from 'drizzle-orm';
import { getDb } from '@fau/db';

export {
  OFFICIAL_STATUS_COLOR,
  OFFICIAL_STATUS_LABEL,
  type OfficialOverallStatus,
} from './official-status-shared';
import type { OfficialOverallStatus } from './official-status-shared';

export interface OfficialStatusRow {
  mirrorId: number;
  name: string;
  statusUrl: string;
  homepage: string | null;
  syncIntervalSeconds: number;
  enabled: boolean;
  sortOrder: number;
  latestStatus: OfficialOverallStatus | null;
  latestFetchedAt: string | null;
  snapshotsLast24h: number;
}

interface RawRow {
  mirror_id: number;
  name: string;
  status_url: string;
  homepage: string | null;
  sync_interval_seconds: number;
  enabled: boolean;
  sort_order: number;
  latest_status: string | null;
  latest_fetched_at: string | null;
  snapshots_24h: number;
}

export async function loadOfficialStatusOverview(): Promise<OfficialStatusRow[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (mirror_id)
        mirror_id, overall_status, fetched_at
      FROM official_status_snapshots
      ORDER BY mirror_id, fetched_at DESC
    ),
    counts AS (
      SELECT mirror_id, COUNT(*)::int AS n
      FROM official_status_snapshots
      WHERE fetched_at >= NOW() - INTERVAL '24 hours'
      GROUP BY mirror_id
    )
    SELECT
      m.id AS mirror_id,
      m.name,
      m.status_url,
      m.homepage,
      m.sync_interval_seconds,
      m.enabled,
      m.sort_order,
      l.overall_status AS latest_status,
      l.fetched_at AS latest_fetched_at,
      COALESCE(c.n, 0)::int AS snapshots_24h
    FROM official_status_mirrors m
    LEFT JOIN latest l ON l.mirror_id = m.id
    LEFT JOIN counts c ON c.mirror_id = m.id
    ORDER BY m.sort_order, m.id
  `)) as unknown as RawRow[];

  return rows.map((r) => ({
    mirrorId: Number(r.mirror_id),
    name: r.name,
    statusUrl: r.status_url,
    homepage: r.homepage,
    syncIntervalSeconds: Number(r.sync_interval_seconds),
    enabled: Boolean(r.enabled),
    sortOrder: Number(r.sort_order),
    latestStatus: (r.latest_status as OfficialOverallStatus | null) ?? null,
    latestFetchedAt: r.latest_fetched_at ? new Date(r.latest_fetched_at).toISOString() : null,
    snapshotsLast24h: Number(r.snapshots_24h),
  }));
}

export interface OfficialStatusHistoryPoint {
  fetchedAt: string;
  overallStatus: OfficialOverallStatus;
}

export async function loadOfficialStatusHistory(
  mirrorId: number,
  hours = 24,
): Promise<OfficialStatusHistoryPoint[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT fetched_at, overall_status
    FROM official_status_snapshots
    WHERE mirror_id = ${mirrorId}
      AND fetched_at >= NOW() - (${hours} || ' hours')::interval
    ORDER BY fetched_at ASC
  `)) as unknown as Array<{ fetched_at: string; overall_status: string }>;
  return rows.map((r) => ({
    fetchedAt: new Date(r.fetched_at).toISOString(),
    overallStatus: r.overall_status as OfficialOverallStatus,
  }));
}
