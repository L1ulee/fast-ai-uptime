/**
 * 极简 i18n: 仅覆盖未做双语标记的导航 / 页脚 / 通用按钮文案。
 * 已有双语 (zh + en) 混排的业务文案保持原样。
 *
 * 使用:
 *   const t = makeT(settings.site.language);
 *   t('nav.status') -> 'Status' / '状态'
 */

export type Lang = 'zh' | 'en';

export const SUPPORTED_LANGS: ReadonlyArray<{ code: Lang; label: string }> = [
  { code: 'zh', label: '简体中文' },
  { code: 'en', label: 'English' },
];

type Catalog = Record<string, string>;

const ZH: Catalog = {
  // 公开页顶部导航
  'nav.public.status': '状态',
  'nav.public.maintenance': '计划维护',
  'nav.public.incidents': '历史事件',
  'nav.public.subscribe': '订阅',
  'nav.public.subscribeTitle': '订阅状态更新',
  'nav.public.upstream': '上游',
  'nav.public.upstreamTitle': '上游 Provider 状态镜像',
  'nav.public.upstreamOk': '{count} 正常',
  'nav.public.upstreamIssues': '{count} 异常',

  // 公开页底部
  'footer.support': '联系支持',
  'footer.api': 'JSON API',
  'footer.webhook': 'Webhook',
  'footer.health': '健康检查',
  'footer.admin': '管理后台',
  'footer.poweredBy': 'Powered by Fast AI Uptime',

  // Admin 侧边栏
  'admin.section.monitor': '监控',
  'admin.section.config': '配置',
  'admin.section.comms': '通信',
  'admin.section.integrations': '集成',
  'admin.section.system': '系统',

  'admin.nav.overview': '概览',
  'admin.nav.configs': '探测组件',
  'admin.nav.providers': 'Providers',
  'admin.nav.models': '模型',
  'admin.nav.groups': '分组',
  'admin.nav.incidents': '事件',
  'admin.nav.maintenances': '维护',
  'admin.nav.announcements': '公告',
  'admin.nav.webhook': 'Webhook',
  'admin.nav.officialStatus': '官方状态',
  'admin.nav.logs': '日志管理',
  'admin.nav.settings': '系统设置',

  'admin.console': '管理后台',
  'admin.theme': '主题',
  'admin.publicPage': '公开状态页',
  'admin.officialMirror': '官方状态镜像',
  'admin.logout': '退出登录',

  'admin.live.ok': '系统运行正常',
  'admin.live.partial': '部分系统异常',
  'admin.live.allOk': '所有探测均正常返回',
  'admin.live.busyTpl': '事件 {incidents} 起 · 维护 {maintenances} 项',

  // /maintenance 与 /incidents 页
  'page.maintenance.title': '计划维护',
  'page.maintenance.empty': '无计划维护',
  'page.incidents.title': '历史事件',
  'page.incidents.empty': '无事件记录',
  'page.incidents.countOne': '{n} 起事件',
  'page.incidents.countMany': '{n} 起事件',
  'page.range.to': '至',

  // official-status 页 tooltip
  'tip.hoursAgo': '{n} 小时前',
  'tip.now': '当前',
  'tip.status': '状态',
  'tip.noData': '无数据',

  // 登录页
  'login.title': '登录到管理后台',
  'login.subtitle': '使用管理员密码登录。',
  'login.passwordLabel': '密码',
  'login.passwordPlaceholder': '管理员密码',
  'login.submit': '登录',
  'login.backToPublic': '← 返回公共状态页',
  'login.brand': 'Admin Console',
  'login.err.bad': '密码错误',
  'login.err.lockedMin': '失败次数过多,请 {min} 分钟后重试',
  'login.err.locked': '失败次数过多,请稍后重试',

  // 底部
  'footer.copyright': '© {year} {name}',
  'admin.footer.repo': '版本仓库',

  // /official-status 事件卡片
  'upstream.impact.critical': '严重',
  'upstream.impact.major': '重大',
  'upstream.impact.minor': '轻微',
  'upstream.impact.maintenance': '维护',
  'upstream.impact.none': '正常',
  'upstream.kind.incident': '事件',
  'upstream.kind.maintenance': '维护',
  'upstream.updateLatest': '最新',
  'upstream.started': '开始',
  'upstream.timeUnknown': '时间未知',
  'upstream.timeAgo.sec': '{n} 秒前',
  'upstream.timeAgo.min': '{n} 分钟前',
  'upstream.timeAgo.hour': '{n} 小时前',
  'upstream.timeAgo.day': '{n} 天前',
};

const EN: Catalog = {
  'nav.public.status': 'Status',
  'nav.public.maintenance': 'Maintenance',
  'nav.public.incidents': 'Previous incidents',
  'nav.public.subscribe': 'Subscribe',
  'nav.public.subscribeTitle': 'Subscribe to status updates',
  'nav.public.upstream': 'Upstream',
  'nav.public.upstreamTitle': 'Upstream provider status mirror',
  'nav.public.upstreamOk': '{count} ok',
  'nav.public.upstreamIssues': '{count} issue(s)',

  'footer.support': 'Support',
  'footer.api': 'JSON API',
  'footer.webhook': 'Webhook',
  'footer.health': 'Health',
  'footer.admin': 'Admin',
  'footer.poweredBy': 'Powered by Fast AI Uptime',

  'admin.section.monitor': 'Monitoring',
  'admin.section.config': 'Configuration',
  'admin.section.comms': 'Communications',
  'admin.section.integrations': 'Integrations',
  'admin.section.system': 'System',

  'admin.nav.overview': 'Overview',
  'admin.nav.configs': 'Probes',
  'admin.nav.providers': 'Providers',
  'admin.nav.models': 'Models',
  'admin.nav.groups': 'Groups',
  'admin.nav.incidents': 'Incidents',
  'admin.nav.maintenances': 'Maintenance',
  'admin.nav.announcements': 'Announcements',
  'admin.nav.webhook': 'Webhook',
  'admin.nav.officialStatus': 'Official status',
  'admin.nav.logs': 'Logs',
  'admin.nav.settings': 'Settings',

  'admin.console': 'Admin Console',
  'admin.theme': 'Theme',
  'admin.publicPage': 'Public status page',
  'admin.officialMirror': 'Official status',
  'admin.logout': 'Sign out',

  'admin.live.ok': 'All systems operational',
  'admin.live.partial': 'Some systems degraded',
  'admin.live.allOk': 'All probes returning healthy',
  'admin.live.busyTpl': '{incidents} incident(s) · {maintenances} maintenance',

  'page.maintenance.title': 'Maintenance',
  'page.maintenance.empty': 'No maintenance scheduled',
  'page.incidents.title': 'Previous incidents',
  'page.incidents.empty': 'No incidents reported',
  'page.incidents.countOne': '{n} incident',
  'page.incidents.countMany': '{n} incidents',
  'page.range.to': 'to',

  'tip.hoursAgo': '{n}h ago',
  'tip.now': 'now',
  'tip.status': 'Status',
  'tip.noData': 'No data',

  'login.title': 'Sign in to admin console',
  'login.subtitle': 'Sign in with the admin password.',
  'login.passwordLabel': 'Password',
  'login.passwordPlaceholder': 'Admin password',
  'login.submit': 'Sign in',
  'login.backToPublic': '← Back to status page',
  'login.brand': 'Admin Console',
  'login.err.bad': 'Wrong password',
  'login.err.lockedMin': 'Too many failed attempts, try again in {min} minutes',
  'login.err.locked': 'Too many failed attempts, please try again later',

  'footer.copyright': '© {year} {name}',
  'admin.footer.repo': 'Source repository',

  'upstream.impact.critical': 'Critical',
  'upstream.impact.major': 'Major',
  'upstream.impact.minor': 'Minor',
  'upstream.impact.maintenance': 'Maintenance',
  'upstream.impact.none': 'None',
  'upstream.kind.incident': 'Incident',
  'upstream.kind.maintenance': 'Maintenance',
  'upstream.updateLatest': 'Latest',
  'upstream.started': 'Started',
  'upstream.timeUnknown': 'time unknown',
  'upstream.timeAgo.sec': '{n}s ago',
  'upstream.timeAgo.min': '{n}m ago',
  'upstream.timeAgo.hour': '{n}h ago',
  'upstream.timeAgo.day': '{n}d ago',
};

const CATALOGS: Record<Lang, Catalog> = { zh: ZH, en: EN };

export function makeT(
  lang: Lang | undefined,
): (key: string, vars?: Record<string, string | number>) => string {
  const cat = CATALOGS[lang ?? 'zh'] ?? ZH;
  return (key, vars) => {
    const tpl = cat[key] ?? ZH[key] ?? key;
    if (!vars) return tpl;
    return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  };
}
