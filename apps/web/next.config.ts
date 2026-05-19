import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Monorepo: 从仓库根加载 .env / .env.local（Next.js 默认只看 cwd）
for (const candidate of ['.env.local', '.env']) {
  const p = resolve(__dirname, '../..', candidate);
  if (existsSync(p)) {
    process.loadEnvFile(p);
    break;
  }
}

const SECURITY_HEADERS = [
  // Clickjacking 防护:整站禁止被 iframe 嵌套。
  { key: 'X-Frame-Options', value: 'DENY' },
  // 阻止浏览器嗅探响应 MIME 类型 (e.g. text/html → script).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // 跨站请求只保留 origin,不暴露完整 URL/query.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // 主流敏感 API 默认拒绝.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  // 基线 CSP: 与 Next.js 内联 style/script 兼容,但禁止外站执行。
  // 如以后启用第三方 analytics / iframe 需要 review。
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Docker: 输出精简的 standalone server（含必要 node_modules trace）
  output: 'standalone',
  // monorepo: tracing root 指向仓库根（Next.js 包在根 node_modules 中）
  outputFileTracingRoot: resolve(__dirname, '../..'),
  // undici 是 packages/core/safe-fetch.ts 经 createRequire 动态加载的;
  // nft trace 看不见,显式包含让 standalone 输出含 undici。
  outputFileTracingIncludes: {
    '/*': ['../../node_modules/.pnpm/undici@*/node_modules/undici/**'],
  },
  typedRoutes: true,
  // @fau/db pulls postgres → 依赖 net/tls/crypto/perf_hooks 等 Node 内建模块。
  // 必须从 transpile 剔除并标记为 server external，否则 instrumentation.ts 入图时 webpack 报错。
  transpilePackages: ['@fau/core', '@fau/providers'],
  serverExternalPackages: [
    '@fau/db',
    'postgres',
    'drizzle-orm',
    'drizzle-orm/postgres-js',
    'undici',
  ],
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },
  // serverExternalPackages 不覆盖 instrumentation.ts 的 webpack pass。
  // 这里显式把 postgres 与 drizzle-orm 标记为 commonjs externals，
  // 让 webpack 写出 `require('postgres')` 而非把它打包进 bundle。
  webpack(config, { isServer }) {
    if (isServer) {
      const externals = config.externals;
      const list = Array.isArray(externals) ? externals : externals ? [externals] : [];
      config.externals = [
        ...list,
        ({ request }: { request?: string }, callback: (err?: unknown, result?: string) => void) => {
          if (!request) return callback();
          // node:* 内置模块（webpack 默认不识别 node: URI scheme）
          if (request.startsWith('node:')) {
            return callback(undefined, `commonjs ${request}`);
          }
          // postgres / drizzle-orm 走 require()，避免 instrumentation 入图时拉进 net/tls 等
          if (
            request === 'postgres' ||
            request === 'drizzle-orm' ||
            request.startsWith('drizzle-orm/')
          ) {
            return callback(undefined, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
