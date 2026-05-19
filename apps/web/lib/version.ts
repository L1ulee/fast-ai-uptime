import pkg from '../package.json';

export const REPO_URL = 'https://github.com/L1ulee/fast-ai-uptime';
const REPO_API = 'https://api.github.com/repos/L1ulee/fast-ai-uptime/releases/latest';

/** package.json 里的版本号,作为 GH 拉不到时的回退。 */
export const FALLBACK_VERSION: string = (pkg as { version?: string }).version ?? '0.0.0';

/**
 * 从 GitHub Releases 拉取最新 tag (例如 "v1.5.0" → 返回 "1.5.0")。
 * 1 小时 ISR 缓存;网络失败 / 无 release / 速率限制时返回 FALLBACK_VERSION。
 */
export async function getLatestVersion(): Promise<{
  version: string;
  source: 'github' | 'fallback';
  releaseUrl: string;
}> {
  try {
    const res = await fetch(REPO_API, {
      headers: { accept: 'application/vnd.github+json' },
      // Next.js ISR: 缓存 1 小时,失败不长期 stuck。
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return { version: FALLBACK_VERSION, source: 'fallback', releaseUrl: REPO_URL };
    }
    const json = (await res.json()) as { tag_name?: string; html_url?: string };
    const tag = (json.tag_name ?? '').trim();
    if (!tag) {
      return { version: FALLBACK_VERSION, source: 'fallback', releaseUrl: REPO_URL };
    }
    const version = tag.replace(/^v/i, '');
    return {
      version,
      source: 'github',
      releaseUrl: json.html_url ?? `${REPO_URL}/releases/tag/${tag}`,
    };
  } catch {
    return { version: FALLBACK_VERSION, source: 'fallback', releaseUrl: REPO_URL };
  }
}
