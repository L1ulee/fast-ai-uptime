import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { requireDatabaseUrl } from './env';
import * as schema from './schema';

let _client: postgres.Sql | null = null;
let _db: ReturnType<typeof createDb> | null = null;

function createDb(sql: postgres.Sql) {
  return drizzle(sql, { schema, casing: 'snake_case' });
}

/**
 * 单例 DB 客户端。
 * Next.js 开发时 HMR 会重载模块；模块作用域单例避免连接池泄漏。
 */
export function getDb() {
  if (_db) return _db;
  const url = requireDatabaseUrl();
  _client = postgres(url, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false,
  });
  _db = createDb(_client);
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end({ timeout: 5 });
    _client = null;
    _db = null;
  }
}

export type Db = ReturnType<typeof getDb>;
