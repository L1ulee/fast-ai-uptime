import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { appSettings, getDb } from '@fau/db';
import { SettingsForm } from '@/components/admin/settings-form';
import { logAudit } from '@/lib/admin/audit';
import {
  type SettingsConfig,
  type SettingsSection,
  coerceSettings,
  getSettings,
} from '@/lib/admin/settings';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SECTION_KEYS: SettingsSection[] = ['site', 'branding', 'public', 'tweaks', 'probe', 'logs'];

/** 保存全部设置：每个 section 一行 upsert 进 app_settings,整体走 transaction 防并发覆盖。 */
async function saveSettings(raw: unknown): Promise<void> {
  'use server';
  await requireAdmin();
  const config = coerceSettings(raw);
  const db = getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const key of SECTION_KEYS) {
      await tx
        .insert(appSettings)
        .values({ key, value: config[key], updatedAt: now })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: config[key], updatedAt: now },
        });
    }
  });
  await logAudit('settings.save');
  // Site/Branding/Tweaks 影响 root layout 与所有公开页;一次性全局失效。
  revalidatePath('/', 'layout');
}

/** 危险区域：导出全部数据为 JSON 字符串（客户端触发下载）。 */
async function exportAllData(): Promise<string> {
  'use server';
  await requireAdmin();
  const db = getDb();
  const tables = [
    'providers',
    'models',
    'groups',
    'check_configs',
    'incidents',
    'incident_updates',
    'incident_components',
    'maintenances',
    'maintenance_components',
    'announcements',
    'subscriptions',
    'subscription_components',
    'official_status_mirrors',
    'official_upstream_incidents',
    'app_settings',
  ];
  const dump: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    note: '不含探测样本与日志（体量大）；如需请单独导出。',
  };
  for (const t of tables) {
    try {
      // sql.identifier 转义表名（t 来自上方硬编码 allowlist，但走 identifier
      // 避免未来贡献者直接拼接用户输入）。
      const rows = (await db.execute(
        sql`SELECT * FROM ${sql.identifier(t)}`,
      )) as unknown as unknown[];
      dump[t] = rows;
    } catch {
      dump[t] = [];
    }
  }
  await logAudit('settings.export_data');
  return JSON.stringify(dump, null, 2);
}

/** 危险区域：清空探测历史（check_results + 5min 聚合）。 */
async function clearProbeHistory(): Promise<void> {
  'use server';
  await requireAdmin();
  const db = getDb();
  await db.execute(sql`TRUNCATE TABLE check_results, check_results_5min`);
  await logAudit('settings.clear_probe_history');
  revalidatePath('/admin');
  revalidatePath('/admin/logs');
  revalidatePath('/');
}

/** 危险区域：重置全部设置为默认值（清空 app_settings 行）。 */
async function resetSettings(): Promise<void> {
  'use server';
  await requireAdmin();
  const db = getDb();
  await db.delete(appSettings);
  await logAudit('settings.reset');
  revalidatePath('/', 'layout');
}

export default async function SettingsPage() {
  await requireAdmin();
  const initial: SettingsConfig = await getSettings();
  return (
    <SettingsForm
      initial={initial}
      saveSettings={saveSettings}
      exportAllData={exportAllData}
      clearProbeHistory={clearProbeHistory}
      resetSettings={resetSettings}
    />
  );
}
