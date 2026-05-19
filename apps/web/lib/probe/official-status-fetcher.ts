import { eq, sql } from 'drizzle-orm';
import { safeFetch, SsrfBlockedError } from '@fau/core';
import {
  getDb,
  officialStatusMirrors,
  officialStatusSnapshots,
  officialUpstreamIncidents,
} from '@fau/db';
import { type OfficialOverallStatus, type FeedKind } from '@/lib/api/official-status-shared';
import { probeEnv } from './env';
import { releaseLease } from './lease';
import { withLease } from './with-lease';

export type { OfficialOverallStatus, FeedKind };

const LEASE_KEY = 'official-status-fetcher';
const LEASE_TTL_SECONDS = 600;
const HTTP_TIMEOUT_MS = 15_000;

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = false;

interface MirrorRow {
  id: number;
  name: string;
  statusUrl: string;
  feedKind: FeedKind;
  feedUrl: string | null;
  syncIntervalSeconds: number;
}

interface UpstreamEvent {
  upstreamId: string;
  kind: 'incident' | 'maintenance';
  title: string;
  status: string | null;
  impact: string | null;
  url: string | null;
  startedAt: Date | null;
  resolvedAt: Date | null;
  lastUpdateBody: string | null;
  lastUpdateAt: Date | null;
  raw: unknown;
}

async function loadEnabledMirrors(): Promise<MirrorRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: officialStatusMirrors.id,
      name: officialStatusMirrors.name,
      statusUrl: officialStatusMirrors.statusUrl,
      feedKind: officialStatusMirrors.feedKind,
      feedUrl: officialStatusMirrors.feedUrl,
      syncIntervalSeconds: officialStatusMirrors.syncIntervalSeconds,
    })
    .from(officialStatusMirrors)
    .where(eq(officialStatusMirrors.enabled, true));
  return rows.map((r) => ({
    ...r,
    feedKind: ((r.feedKind ?? 'statuspage_v2') as FeedKind) ?? 'statuspage_v2',
  }));
}

// ─── statuspage.io ────────────────────────────────────────────────────

/** 归一化为 statuspage 站点根：去掉末尾斜杠与任意 /api/v2/*.json 后缀。 */
function statuspageBase(base: string): string {
  return base.replace(/\/+$/, '').replace(/\/api\/v2\/[a-z-]+\.json$/i, '');
}

function indicatorToStatus(indicator: string | undefined): OfficialOverallStatus {
  switch (indicator) {
    case 'none':
      return 'operational';
    case 'minor':
      return 'degraded';
    case 'major':
      return 'partial_outage';
    case 'critical':
      return 'major_outage';
    case 'maintenance':
      return 'maintenance';
    default:
      return 'unknown';
  }
}

/** 拉取单个 statuspage.io endpoint 并解析为 JSON 对象；失败返回 null。 */
async function fetchStatuspageJson(
  mirror: MirrorRow,
  base: string,
  path: string,
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await safeFetch(`${base}${path}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `[official-status] mirror ${mirror.id} (${mirror.name}): ${path} HTTP ${res.status}`,
      );
      return null;
    }
    const json = (await res.json()) as unknown;
    if (typeof json !== 'object' || json === null) return null;
    return json as Record<string, unknown>;
  } catch (err) {
    const msg =
      err instanceof SsrfBlockedError
        ? `blocked: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.warn(`[official-status] mirror ${mirror.id}: ${path} ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchStatuspage(mirror: MirrorRow): Promise<{
  overallStatus: OfficialOverallStatus;
  description: string | null;
  rawPayload: unknown;
  events: UpstreamEvent[];
} | null> {
  const base = statuspageBase(mirror.feedUrl ?? mirror.statusUrl);
  // summary.json 给整体状态；incidents.json / scheduled-maintenances.json 给
  // **完整历史**（含已解决/已完成）。只看 summary.json 会漏掉上游已解决的事件 —
  // 它一旦 resolved 就从 summary 消失，导致本地行永远停在旧状态。
  const [summary, incidentsDoc, maintsDoc] = await Promise.all([
    fetchStatuspageJson(mirror, base, '/api/v2/summary.json'),
    fetchStatuspageJson(mirror, base, '/api/v2/incidents.json'),
    fetchStatuspageJson(mirror, base, '/api/v2/scheduled-maintenances.json'),
  ]);
  // 整体状态拿不到就算这次失败（incidents/maints 缺失可降级到 summary 内的活跃列表）
  if (!summary) return null;

  const status = summary.status as Record<string, unknown> | undefined;
  const indicator = typeof status?.indicator === 'string' ? status.indicator : undefined;
  const description = typeof status?.description === 'string' ? status.description : null;

  const events: UpstreamEvent[] = [];
  const incidents = Array.isArray(incidentsDoc?.incidents)
    ? (incidentsDoc.incidents as unknown[])
    : Array.isArray(summary.incidents)
      ? (summary.incidents as unknown[])
      : [];
  for (const inc of incidents) {
    const e = parseStatuspageIncident(inc, 'incident');
    if (e) events.push(e);
  }
  const maints = Array.isArray(maintsDoc?.scheduled_maintenances)
    ? (maintsDoc.scheduled_maintenances as unknown[])
    : Array.isArray(summary.scheduled_maintenances)
      ? (summary.scheduled_maintenances as unknown[])
      : [];
  for (const m of maints) {
    const e = parseStatuspageIncident(m, 'maintenance');
    if (e) events.push(e);
  }

  return {
    overallStatus: indicatorToStatus(indicator),
    description,
    rawPayload: summary,
    events,
  };
}

function parseStatuspageIncident(
  raw: unknown,
  kind: 'incident' | 'maintenance',
): UpstreamEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : null;
  const title = typeof o.name === 'string' ? o.name : null;
  if (!id || !title) return null;
  const updates = Array.isArray(o.incident_updates) ? (o.incident_updates as unknown[]) : [];
  let lastBody: string | null = null;
  let lastAt: Date | null = null;
  for (const u of updates) {
    if (!u || typeof u !== 'object') continue;
    const uo = u as Record<string, unknown>;
    const body = typeof uo.body === 'string' ? uo.body : null;
    const at = typeof uo.created_at === 'string' ? new Date(uo.created_at) : null;
    if (!at || Number.isNaN(at.getTime())) continue;
    if (!lastAt || at.getTime() > lastAt.getTime()) {
      lastAt = at;
      lastBody = body;
    }
  }
  const startedAt = parseDate(
    kind === 'maintenance' ? o.scheduled_for : (o.started_at ?? o.created_at),
  );
  const resolvedAt = parseDate(
    o.resolved_at ?? (kind === 'maintenance' ? o.scheduled_until : null),
  );
  return {
    upstreamId: id,
    kind,
    title,
    status: typeof o.status === 'string' ? o.status : null,
    impact: typeof o.impact === 'string' ? o.impact : null,
    url: typeof o.shortlink === 'string' ? o.shortlink : null,
    startedAt,
    resolvedAt,
    lastUpdateBody: lastBody,
    lastUpdateAt: lastAt,
    raw,
  };
}

// ─── RSS / Atom ────────────────────────────────────────────────────

async function fetchFeed(mirror: MirrorRow): Promise<{
  events: UpstreamEvent[];
  rawPayload: unknown;
} | null> {
  const url = mirror.feedUrl ?? mirror.statusUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await safeFetch(url, {
      method: 'GET',
      headers: { accept: 'application/rss+xml, application/atom+xml, text/xml, */*' },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[official-status] mirror ${mirror.id} (${mirror.name}): HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    const events = mirror.feedKind === 'atom' ? parseAtom(text) : parseRss(text);
    return { events, rawPayload: { kind: mirror.feedKind, xml: text.slice(0, 16_000) } };
  } catch (err) {
    const msg =
      err instanceof SsrfBlockedError
        ? `blocked: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.warn(`[official-status] mirror ${mirror.id}: ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseRss(xml: string): UpstreamEvent[] {
  const out: UpstreamEvent[] = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  for (const match of xml.matchAll(itemRe)) {
    const item = match[0];
    const title = textTag(item, 'title');
    const link = textTag(item, 'link');
    const description = textTag(item, 'description');
    const pubDateStr = textTag(item, 'pubDate');
    const guid = textTag(item, 'guid') ?? link ?? title;
    if (!title || !guid) continue;
    const startedAt = pubDateStr ? new Date(pubDateStr) : null;
    const status = inferStatusFromTitle(title);
    out.push({
      upstreamId: guid,
      kind: inferKindFromTitle(title),
      title: stripHtml(title).slice(0, 500),
      status,
      impact: null,
      url: link ?? null,
      startedAt: startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null,
      resolvedAt: status === 'resolved' || status === 'completed' ? startedAt : null,
      lastUpdateBody: description ? stripHtml(description).slice(0, 2000) : null,
      lastUpdateAt: startedAt,
      raw: { title, link, description, pubDate: pubDateStr, guid },
    });
  }
  return out;
}

function parseAtom(xml: string): UpstreamEvent[] {
  const out: UpstreamEvent[] = [];
  const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
  for (const match of xml.matchAll(entryRe)) {
    const entry = match[0];
    const title = textTag(entry, 'title');
    const id = textTag(entry, 'id') ?? title ?? null;
    const summary = textTag(entry, 'summary') ?? textTag(entry, 'content');
    const updatedStr = textTag(entry, 'updated') ?? textTag(entry, 'published');
    const linkHref = entry.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? null;
    if (!title || !id) continue;
    const updated = updatedStr ? new Date(updatedStr) : null;
    const status = inferStatusFromTitle(title);
    out.push({
      upstreamId: id,
      kind: inferKindFromTitle(title),
      title: stripHtml(title).slice(0, 500),
      status,
      impact: null,
      url: linkHref,
      startedAt: updated && !Number.isNaN(updated.getTime()) ? updated : null,
      resolvedAt: status === 'resolved' || status === 'completed' ? updated : null,
      lastUpdateBody: summary ? stripHtml(summary).slice(0, 2000) : null,
      lastUpdateAt: updated,
      raw: { title, id, summary, updated: updatedStr, link: linkHref },
    });
  }
  return out;
}

function textTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  let v = m[1] ?? '';
  v = v
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .trim();
  return v || null;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function inferStatusFromTitle(title: string): string | null {
  const lower = title.toLowerCase();
  if (/\[?\bresolved\b\]?/.test(lower) || lower.includes('已恢复')) return 'resolved';
  if (/\[?\bcompleted\b\]?/.test(lower) || lower.includes('已完成')) return 'completed';
  if (/\[?\bmonitoring\b\]?/.test(lower) || lower.includes('观察中')) return 'monitoring';
  if (/\[?\bidentified\b\]?/.test(lower) || lower.includes('已定位')) return 'identified';
  if (/\[?\binvestigating\b\]?/.test(lower) || lower.includes('调查中')) return 'investigating';
  if (/\[?\bscheduled\b\]?/.test(lower) || /scheduled maintenance/i.test(title)) return 'scheduled';
  if (/\[?\bin progress\b\]?/.test(lower)) return 'in_progress';
  return null;
}

function inferKindFromTitle(title: string): 'incident' | 'maintenance' {
  return /maintenance|计划|维护/i.test(title) ? 'maintenance' : 'incident';
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Upsert ────────────────────────────────────────────────────────

async function upsertUpstreamEvents(mirrorId: number, events: UpstreamEvent[]): Promise<void> {
  if (events.length === 0) return;
  const db = getDb();
  for (const e of events) {
    await db
      .insert(officialUpstreamIncidents)
      .values({
        mirrorId,
        upstreamId: e.upstreamId,
        kind: e.kind,
        title: e.title,
        status: e.status,
        impact: e.impact,
        url: e.url,
        startedAt: e.startedAt,
        resolvedAt: e.resolvedAt,
        lastUpdateBody: e.lastUpdateBody,
        lastUpdateAt: e.lastUpdateAt,
        raw: e.raw as object,
      })
      .onConflictDoUpdate({
        target: [officialUpstreamIncidents.mirrorId, officialUpstreamIncidents.upstreamId],
        set: {
          title: e.title,
          status: e.status,
          impact: e.impact,
          url: e.url,
          startedAt: e.startedAt,
          resolvedAt: e.resolvedAt,
          lastUpdateBody: e.lastUpdateBody,
          lastUpdateAt: e.lastUpdateAt,
          raw: e.raw as object,
          kind: e.kind,
          updatedAt: new Date(),
        },
      });
  }
}

// ─── Per-mirror fetch + write ──────────────────────────────────────

async function runOneMirror(mirror: MirrorRow): Promise<boolean> {
  const db = getDb();
  if (mirror.feedKind === 'statuspage_v2') {
    const snap = await fetchStatuspage(mirror);
    if (!snap) return false;
    await db.insert(officialStatusSnapshots).values({
      mirrorId: mirror.id,
      fetchedAt: new Date(),
      overallStatus: snap.overallStatus,
      description: snap.description,
      rawPayload: snap.rawPayload as object,
    });
    await upsertUpstreamEvents(mirror.id, snap.events);
    return true;
  }
  // rss / atom
  const feed = await fetchFeed(mirror);
  if (!feed) return false;
  // Derive an overallStatus from the most recent unresolved event.
  const unresolved = feed.events.find((e) => !e.resolvedAt);
  const overall: OfficialOverallStatus = unresolved ? 'degraded' : 'operational';
  await db.insert(officialStatusSnapshots).values({
    mirrorId: mirror.id,
    fetchedAt: new Date(),
    overallStatus: overall,
    description: unresolved ? unresolved.title : null,
    rawPayload: feed.rawPayload as object,
  });
  await upsertUpstreamEvents(mirror.id, feed.events);
  return true;
}

// ─── Public refresh entry points ───────────────────────────────────

export async function refreshAllOfficialStatuses(
  options: { force?: boolean } = {},
): Promise<{ ok: number; failed: number; skipped: number }> {
  const force = options.force ?? true;
  const rows = await loadEnabledMirrors();
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  const db = getDb();

  // 非 force 模式下，读取每个 mirror 的最近快照时间用于 sync-interval 节流。
  // 注意：不能把 JS 数组插进 sql`` 模板（drizzle 会绑成 record，导致
  // "cannot cast type record to bigint[]"）。这里直接整表 GROUP BY —
  // official_status_snapshots 已按 7 天裁剪，行数很小；多出的 mirror_id
  // 不会被读取（下方只 latest.get(m.id)）。
  const latest = force
    ? new Map<number, Date>()
    : new Map<number, Date>(
        (
          (await db.execute(sql`
            SELECT mirror_id, MAX(fetched_at) AS last
            FROM official_status_snapshots
            GROUP BY mirror_id
          `)) as unknown as Array<{ mirror_id: number; last: string | Date }>
        ).map((r) => [Number(r.mirror_id), r.last instanceof Date ? r.last : new Date(r.last)]),
      );

  const now = Date.now();
  for (const m of rows) {
    if (!force) {
      const last = latest.get(m.id);
      if (last && now - last.getTime() < m.syncIntervalSeconds * 1000) {
        skipped += 1;
        continue;
      }
    }
    const success = await runOneMirror(m);
    if (success) ok += 1;
    else failed += 1;
  }
  await db.execute(sql`
    DELETE FROM official_status_snapshots
    WHERE fetched_at < NOW() - INTERVAL '7 days'
  `);
  return { ok, failed, skipped };
}

export async function refreshOfficialStatusByMirror(mirrorId: number): Promise<boolean> {
  const db = getDb();
  const [m] = await db
    .select({
      id: officialStatusMirrors.id,
      name: officialStatusMirrors.name,
      statusUrl: officialStatusMirrors.statusUrl,
      feedKind: officialStatusMirrors.feedKind,
      feedUrl: officialStatusMirrors.feedUrl,
      syncIntervalSeconds: officialStatusMirrors.syncIntervalSeconds,
    })
    .from(officialStatusMirrors)
    .where(eq(officialStatusMirrors.id, mirrorId))
    .limit(1);
  if (!m) return false;
  return runOneMirror({
    ...m,
    feedKind: (m.feedKind ?? 'statuspage_v2') as FeedKind,
  });
}

async function tick(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    await withLease(LEASE_KEY, probeEnv.nodeId, LEASE_TTL_SECONDS, async () => {
      const { ok, failed, skipped } = await refreshAllOfficialStatuses({ force: false });
      if (ok + failed > 0) {
        console.log(`[official-status] tick: ok=${ok} failed=${failed} skipped=${skipped}`);
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[official-status] ${msg}`);
  } finally {
    running = false;
  }
}

export function startOfficialStatusFetcher(): void {
  if (timer || stopped) return;
  setTimeout(() => {
    if (stopped) return;
    timer = setInterval(() => void tick(), probeEnv.officialStatusIntervalSeconds * 1000);
    void tick();
  }, 20_000);
  console.log(`[official-status] started (interval=${probeEnv.officialStatusIntervalSeconds}s)`);
}

export async function stopOfficialStatusFetcher(): Promise<void> {
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  try {
    await releaseLease(LEASE_KEY, probeEnv.nodeId);
  } catch {
    // ignore
  }
}
