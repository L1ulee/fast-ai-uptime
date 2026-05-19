import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@fau/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PERIOD_MAP: Record<string, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

interface BucketRow {
  bucket_at: string;
  total: number;
  ok_count: number;
  degraded_count: number;
  down_count: number;
  p50_ms: number | null;
  p95_ms: number | null;
  p99_ms: number | null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const configId = Number.parseInt(id, 10);
  if (!Number.isFinite(configId) || configId <= 0) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const url = new URL(req.url);
  const period = url.searchParams.get('period') ?? '7d';
  const intervalLiteral = PERIOD_MAP[period];
  if (!intervalLiteral) {
    return NextResponse.json(
      {
        error: 'invalid_period',
        allowed: Object.keys(PERIOD_MAP),
      },
      { status: 400 },
    );
  }

  const db = getDb();

  try {
    // 鉴权门：仅暴露 enabled=true 的 config（避免 IDOR 枚举禁用/未发布配置）
    const configCheck = (await db.execute(sql`
      SELECT id FROM check_configs WHERE id = ${configId} AND enabled = true
    `)) as unknown as Array<{ id: number }>;
    if (configCheck.length === 0) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // 24h 用原始 results；其它用 5min 聚合
    const rows =
      period === '24h'
        ? ((await db.execute(sql`
            SELECT
              date_bin('5 minutes', checked_at, TIMESTAMPTZ '2025-01-01') AS bucket_at,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'ok')::int AS ok_count,
              COUNT(*) FILTER (WHERE status = 'degraded')::int AS degraded_count,
              COUNT(*) FILTER (WHERE status IN ('down','timeout'))::int AS down_count,
              PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS p50_ms,
              PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95_ms,
              PERCENTILE_DISC(0.99) WITHIN GROUP (ORDER BY latency_ms)::int AS p99_ms
            FROM check_results
            WHERE config_id = ${configId}
              AND checked_at >= NOW() - INTERVAL '24 hours'
            GROUP BY bucket_at
            ORDER BY bucket_at
          `)) as unknown as BucketRow[])
        : ((await db.execute(sql`
            SELECT
              bucket_at, total, ok_count, degraded_count, down_count,
              p50_ms, p95_ms, p99_ms
            FROM check_results_5min
            WHERE config_id = ${configId}
              AND bucket_at >= NOW() - (${intervalLiteral})::interval
            ORDER BY bucket_at
          `)) as unknown as BucketRow[]);

    return NextResponse.json(
      {
        configId,
        period,
        buckets: rows.map((r) => ({
          bucketAt: new Date(r.bucket_at).toISOString(),
          total: Number(r.total),
          okCount: Number(r.ok_count),
          degradedCount: Number(r.degraded_count),
          downCount: Number(r.down_count),
          p50Ms: r.p50_ms === null ? null : Number(r.p50_ms),
          p95Ms: r.p95_ms === null ? null : Number(r.p95_ms),
          p99Ms: r.p99_ms === null ? null : Number(r.p99_ms),
        })),
      },
      {
        headers: {
          'access-control-allow-origin': '*',
          'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
        },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[api/v1/components/${configId}/history] ${msg}`);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
