import { NextResponse } from 'next/server';
import { buildStatusResponse } from '@/lib/api/build-status';
import { computeEtag } from '@/lib/api/etag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  let body: string;
  try {
    const data = await buildStatusResponse();
    body = JSON.stringify(data);
  } catch (err) {
    // 不把内部错误消息回给客户端 (可能泄露 SQL/字段名/路径);仅 server-side 记录。
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[api/v1/status] ${msg}`);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  const etag = computeEtag(body);
  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { etag, 'cache-control': cacheControl() },
    });
  }
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      etag,
      'cache-control': cacheControl(),
    },
  });
}

function cacheControl(): string {
  return 'public, max-age=0, s-maxage=30, stale-while-revalidate=60';
}
