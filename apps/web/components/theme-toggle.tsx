'use client';

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

type Mode = 'light' | 'dark' | 'system';

const MODES: Array<{ value: Mode; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: '浅色', Icon: Sun },
  { value: 'dark', label: '深色', Icon: Moon },
  { value: 'system', label: '系统', Icon: Monitor },
];

export interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * 三态主题切换：light / dark / system。
 * 点击对应图标即设定该模式。系统模式跟随 prefers-color-scheme。
 */
export function ThemeToggle({ className, size = 'sm' }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const current: Mode = mounted ? ((theme ?? 'system') as Mode) : 'system';
  const buttonSize = size === 'md' ? 'h-8 w-8' : 'h-7 w-7';

  return (
    <div
      role="radiogroup"
      aria-label="主题切换"
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-background p-0.5',
        className,
      )}
    >
      {MODES.map(({ value, label, Icon }) => {
        const active = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex items-center justify-center rounded-sm transition-colors',
              buttonSize,
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
