import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// 从 monorepo 根加载 .env（drizzle-kit 默认不读 .env）
// 注意：drizzle-kit 把配置转译为 CJS，__dirname 可用，import.meta 不可用
const here = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
for (const candidate of ['.env.local', '.env']) {
  const p = resolve(here, '../../', candidate);
  if (existsSync(p)) {
    process.loadEnvFile(p);
    break;
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run drizzle-kit');
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
