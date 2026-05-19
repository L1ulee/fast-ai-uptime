import { lookup } from 'node:dns/promises';
import { createRequire } from 'node:module';
import { isIP } from 'node:net';
import type { Agent as UndiciAgent } from 'undici';

// 用 createRequire 让 webpack 把 undici 当作不透明的运行时 require,不参与打包。
// 否则 webpack 会尝试 bundle undici 里的浏览器 polyfill (引用 string_decoder 等),失败。
type AgentCtor = new (opts: ConstructorParameters<typeof UndiciAgent>[0]) => UndiciAgent;
let _AgentCtor: AgentCtor | null = null;
function getUndiciAgentCtor(): AgentCtor {
  if (!_AgentCtor) {
    const req = createRequire(import.meta.url);
    const undici = req('undici') as { Agent: AgentCtor };
    _AgentCtor = undici.Agent;
  }
  return _AgentCtor;
}

export interface SafeFetchOptions extends RequestInit {
  /** Hard cap on redirect hops (default 5). Each hop re-validates the target. */
  maxRedirects?: number;
  /** Allow specific hosts even if they resolve to private IPs (rare; testing). */
  allowedHosts?: ReadonlySet<string>;
}

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

/**
 * fetch wrapper that rejects URLs resolving to private / loopback / link-local /
 * multicast / metadata addresses, and manually follows redirects so each hop is
 * re-validated. Use for any outbound request whose target is influenced by
 * untrusted input (admin-supplied URLs included — admins are trusted but the
 * targets they paste are not).
 *
 * **DNS rebinding 防护**: 我们解析一次拿到 IP,然后用 undici `Agent` 把这次连接
 * 钉死在该 IP 上 (Host/SNI 仍保留原 hostname)。即使攻击者把同一域名映射到
 * 短 TTL + 切到 169.254.169.254,validate→connect 期间也不会被切换。
 */
export async function safeFetch(
  input: string | URL,
  init: SafeFetchOptions = {},
): Promise<Response> {
  const { maxRedirects = 5, allowedHosts, ...rest } = init;
  let current = typeof input === 'string' ? input : input.toString();

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const resolved = await resolveSafely(current, allowedHosts);
    // 把验证过的 IP 钉死给 undici;hostname 仍走 SNI / Host header。
    // 短 keep-alive + pipelining=0:agent 用完一次后,连接很快自然关闭并被 GC;
    // 不能在 finally 里 close(),否则会在 caller 读 body 前掐断 stream。
    const dispatcher = resolved
      ? new (getUndiciAgentCtor())({
          pipelining: 0,
          keepAliveTimeout: 1_000,
          keepAliveMaxTimeout: 1_000,
          // undici 期望 lookup callback 收到 [{address, family}] 数组形式
          // (即 dns.lookup {all:true} 的 callback shape),传单值会触发
          // ERR_INVALID_IP_ADDRESS。
          connect: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            lookup: ((_hostname: string, _options: unknown, cb: any) => {
              cb(null, [{ address: resolved.address, family: resolved.family }]);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any,
          },
        })
      : undefined;
    const res = await fetch(current, {
      ...rest,
      redirect: 'manual',
      // undici 接受非标准 dispatcher 字段透传;TS 上 cast 一下。
      ...(dispatcher ? ({ dispatcher } as unknown as RequestInit) : {}),
    });
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get('location');
    if (!location) return res;
    // Resolve relative redirects against the current URL.
    current = new URL(location, current).toString();
  }
  throw new SsrfBlockedError(`too many redirects (>${maxRedirects})`);
}

/**
 * 校验 URL 安全后,返回选定的 IP+family,用于把 fetch 连接钉死在该地址。
 * 如果 host 已是字面 IP 或 bypass 生效,则返回 null (让 fetch 走默认解析)。
 */
async function resolveSafely(
  rawUrl: string,
  allowedHosts?: ReadonlySet<string>,
): Promise<{ address: string; family: 4 | 6 } | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(`invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`unsupported scheme: ${url.protocol}`);
  }
  const host = url.hostname;
  if (!host) throw new SsrfBlockedError('empty host');
  if (allowedHosts?.has(host)) return null;
  if (process.env.SAFE_FETCH_BYPASS_GUARD === '1' && process.env.NODE_ENV !== 'production') {
    return null;
  }
  const literal = stripIpv6Brackets(host);
  const ipKind = isIP(literal);
  if (ipKind === 4 || ipKind === 6) {
    assertPublicIp(literal, ipKind);
    return { address: literal, family: ipKind === 6 ? 6 : 4 };
  }
  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(host, { all: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SsrfBlockedError(`DNS lookup failed for ${host}: ${msg}`);
  }
  if (records.length === 0) {
    throw new SsrfBlockedError(`no A/AAAA records for ${host}`);
  }
  // 全部 IP 必须公网;然后取第一条 pin 给 dispatcher。
  for (const r of records) {
    assertPublicIp(r.address, r.family === 6 ? 6 : 4);
  }
  const first = records[0]!;
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

/** Throws SsrfBlockedError if the URL is unsafe to fetch. */
export async function assertSafeUrl(
  rawUrl: string,
  allowedHosts?: ReadonlySet<string>,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(`invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`unsupported scheme: ${url.protocol}`);
  }
  const host = url.hostname;
  if (!host) throw new SsrfBlockedError('empty host');
  if (allowedHosts?.has(host)) return;
  // Test-only bypass: scheme is still enforced above, but DNS+IP checks are
  // skipped so unit tests with mocked fetch don't have to resolve real hosts.
  // Hard-gated on NODE_ENV !== 'production' so a leaked env var in prod is inert.
  if (process.env.SAFE_FETCH_BYPASS_GUARD === '1' && process.env.NODE_ENV !== 'production') {
    return;
  }

  // If host is already a literal IP, validate directly.
  const literal = stripIpv6Brackets(host);
  const ipKind = isIP(literal);
  if (ipKind === 4 || ipKind === 6) {
    assertPublicIp(literal, ipKind);
    return;
  }

  // Otherwise resolve DNS. lookup({ all: true }) returns every A/AAAA so a
  // hostname mapping ANY private address gets rejected (DNS-rebinding defence
  // for this hop — receivers should still validate on each request).
  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(host, { all: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SsrfBlockedError(`DNS lookup failed for ${host}: ${msg}`);
  }
  if (records.length === 0) {
    throw new SsrfBlockedError(`no A/AAAA records for ${host}`);
  }
  for (const r of records) {
    assertPublicIp(r.address, r.family === 6 ? 6 : 4);
  }
}

function stripIpv6Brackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function assertPublicIp(ip: string, family: 4 | 6): void {
  // SAFE_FETCH_EXTRA_ALLOWED_CIDRS 是 opt-in 白名单,逗号分隔的 IPv4 CIDR。
  // 典型场景: 本地装了 Clash/Surge 类代理,出口在 198.18.0.0/15 这种保留段。
  if (family === 4 && isIpv4InExtraAllowed(ip)) return;
  if (family === 4) {
    if (isPrivateIpv4(ip)) {
      throw new SsrfBlockedError(`blocked private/reserved IPv4: ${ip}`);
    }
    return;
  }
  if (isPrivateIpv6(ip)) {
    throw new SsrfBlockedError(`blocked private/reserved IPv6: ${ip}`);
  }
}

let _allowedCidrsCache: Array<{ base: number; mask: number }> | null = null;
let _allowedCidrsCacheKey = '';

function parsedAllowedCidrs(): Array<{ base: number; mask: number }> {
  const raw = process.env.SAFE_FETCH_EXTRA_ALLOWED_CIDRS ?? '';
  if (raw === _allowedCidrsCacheKey && _allowedCidrsCache) return _allowedCidrsCache;
  const out: Array<{ base: number; mask: number }> = [];
  for (const item of raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = item.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
    if (!m) continue;
    const ip = m[1] ?? '';
    const bits = Number.parseInt(m[2] ?? '0', 10);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) continue;
    const ipNum = ipv4ToUint32(ip);
    if (ipNum === null) continue;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    out.push({ base: (ipNum & mask) >>> 0, mask });
  }
  _allowedCidrsCacheKey = raw;
  _allowedCidrsCache = out;
  return out;
}

function isIpv4InExtraAllowed(ip: string): boolean {
  const cidrs = parsedAllowedCidrs();
  if (cidrs.length === 0) return false;
  const ipNum = ipv4ToUint32(ip);
  if (ipNum === null) return false;
  for (const c of cidrs) {
    if ((ipNum & c.mask) >>> 0 === c.base) return true;
  }
  return false;
}

function ipv4ToUint32(ip: string): number | null {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts as [number, number, number, number];
  // 0.0.0.0/8 — "this network" / unspecified
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 — loopback
  if (a === 127) return true;
  // 169.254.0.0/16 — link-local incl. AWS/GCP metadata 169.254.169.254
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24, 192.0.2.0/24 (TEST-NET-1), 192.88.99.0/24
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 88 && parts[2] === 99) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 (TEST-NET-2), 203.0.113.0/24 (TEST-NET-3)
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, 255.255.255.255 broadcast
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  // Parse to 16 bytes so 4-in-6 variants (dotted ::ffff:127.0.0.1, hex-group
  // ::ffff:7f00:1, ::7f00:1, compressed forms) all collapse to the same check.
  const bytes = ipv6ToBytes(ip);
  if (!bytes) return true; // unparseable → treat as unsafe
  // ::ffff:a.b.c.d (IPv4-mapped) or ::a.b.c.d (IPv4-compat, deprecated)
  const isMapped =
    bytes[10] === 0xff && bytes[11] === 0xff && bytes.slice(0, 10).every((b) => b === 0);
  const isCompat = bytes.slice(0, 12).every((b) => b === 0);
  if (isMapped || isCompat) {
    const v4 = `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
    return isPrivateIpv4(v4);
  }
  // ::1 loopback / :: unspecified
  if (bytes.slice(0, 15).every((b) => b === 0)) return true; // covers :: and ::1
  // fc00::/7 ULA — first byte 0xfc or 0xfd
  if (bytes[0] === 0xfc || bytes[0] === 0xfd) return true;
  // fe80::/10 link-local — first byte 0xfe, top 2 bits of byte 1 = 10
  if (bytes[0] === 0xfe && (bytes[1] ?? 0) >= 0x80 && (bytes[1] ?? 0) <= 0xbf) {
    return true;
  }
  // ff00::/8 multicast
  if (bytes[0] === 0xff) return true;
  return false;
}

/** Expand an IPv6 string (any compressed/4-in-6 form) into 16 bytes; null if malformed. */
function ipv6ToBytes(ip: string): number[] | null {
  const lower = ip.toLowerCase().trim();
  if (!lower) return null;
  // Split off zone-id like fe80::1%eth0
  const noZone = lower.split('%')[0] ?? lower;
  // Dotted-tail variants: replace trailing IPv4 with two hex groups so the
  // rest of the parser uniformly produces 8 16-bit groups.
  const dottedMatch = noZone.match(/^(.*?:)(\d+\.\d+\.\d+\.\d+)$/);
  let normalized = noZone;
  if (dottedMatch) {
    const head = dottedMatch[1] ?? '';
    const v4parts = (dottedMatch[2] ?? '').split('.').map((p) => Number.parseInt(p, 10));
    if (v4parts.length !== 4 || v4parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return null;
    }
    const [a, b, c, d] = v4parts as [number, number, number, number];
    const g1 = ((a << 8) | b).toString(16);
    const g2 = ((c << 8) | d).toString(16);
    normalized = `${head}${g1}:${g2}`;
  }
  // Expand `::` once
  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const leftRaw = halves[0] ?? '';
  const rightRaw = halves[1] ?? '';
  const left = leftRaw === '' ? [] : leftRaw.split(':');
  const right = rightRaw === '' ? [] : rightRaw.split(':');
  let groups: string[];
  if (halves.length === 2) {
    const fillCount = 8 - left.length - right.length;
    if (fillCount < 0) return null;
    groups = [...left, ...Array(fillCount).fill('0'), ...right];
  } else {
    groups = left;
  }
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const v = Number.parseInt(g, 16);
    bytes.push((v >> 8) & 0xff, v & 0xff);
  }
  return bytes;
}
