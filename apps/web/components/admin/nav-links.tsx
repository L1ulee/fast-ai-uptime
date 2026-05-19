'use client';

import {
  AlertTriangle,
  Boxes,
  Globe,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  ScrollText,
  Settings,
  Webhook,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavIcon =
  | 'dashboard'
  | 'components'
  | 'incidents'
  | 'maint'
  | 'ann'
  | 'webhook'
  | 'globe'
  | 'logs'
  | 'settings';

const ICON_MAP: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  components: Boxes,
  incidents: AlertTriangle,
  maint: Wrench,
  ann: Megaphone,
  webhook: Webhook,
  globe: Globe,
  logs: ScrollText,
  settings: Settings,
};

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  count?: number | null;
  /** 仅 'rose' 影响 count 徽章用 st-major 配色；其它 → 中性 */
  accent?: 'rose';
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export function NavLinks({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  return (
    <nav style={{ padding: '4px 8px', flex: 1, overflowY: 'auto' }}>
      {sections.map((s) => (
        <div key={s.title} style={{ marginBottom: 14 }}>
          <div
            className="subtle"
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              padding: '6px 10px',
            }}
          >
            {s.title}
          </div>
          {s.items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/admin' && pathname.startsWith(`${item.href}/`));
            const Icon = ICON_MAP[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 6,
                  background: active ? 'var(--bg-hover)' : 'transparent',
                  color: active ? 'var(--fg)' : 'var(--fg-muted)',
                  fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  textAlign: 'left',
                  textDecoration: 'none',
                  transition: 'background 100ms',
                }}
              >
                <span
                  style={{
                    color: active ? 'var(--brand)' : 'var(--fg-subtle)',
                    display: 'inline-flex',
                  }}
                  aria-hidden
                >
                  <Icon size={14} />
                </span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.count != null && item.count > 0 && (
                  <span
                    className="tabular"
                    style={{
                      fontSize: 10.5,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background:
                        item.accent === 'rose' ? 'var(--st-major-bg)' : 'var(--bg-subtle)',
                      color: item.accent === 'rose' ? 'var(--st-major)' : 'var(--fg-subtle)',
                      fontWeight: 500,
                    }}
                  >
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
