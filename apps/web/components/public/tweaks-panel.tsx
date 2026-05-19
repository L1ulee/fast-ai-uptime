'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Monitor, Moon, Settings, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  DENSITY_VALUES,
  HEATMAP_DAY_VALUES,
  HERO_VARIANT_VALUES,
  SATURATION_VALUES,
  TWEAK_COOKIE,
  type Density,
  type HeatmapDays,
  type HeroVariant,
  type Saturation,
  type Tweaks,
} from '@/lib/tweaks';
import { cn } from '@/lib/utils';

const DENSITY_LABEL: Record<Density, string> = {
  compact: '紧凑',
  standard: '标准',
  comfortable: '宽松',
};

const SATURATION_LABEL: Record<Saturation, string> = {
  rich: '鲜明',
  muted: '柔和',
};

const HERO_LABEL: Record<HeroVariant, string> = {
  panel: '面板',
  minimal: '极简',
  split: '双栏',
};

interface Props {
  initial: Tweaks;
  /** Admin 配置的"无 cookie 时默认值"。reset 时回到这里而不是内置常量。 */
  adminDefaults?: Tweaks;
  /** Admin 关闭后,所有 segment 变成只读,并展示一行 hint。 */
  allowOverride?: boolean;
}

function setCookie(name: string, value: string) {
  const maxAge = TWEAK_COOKIE.maxAge;
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAge};samesite=lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=;path=/;max-age=0;samesite=lax`;
}

/** 直接写 <html> dataset，避免 useEffect 与 SSR 同值二次写入造成的"同步窗口"。 */
function applyHtmlAttr(key: 'density' | 'saturation', value: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset[key] = value;
  }
}

export function TweaksPanel({ initial, adminDefaults, allowOverride = true }: Props) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [tweaks, setTweaks] = useState<Tweaks>(initial);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function patch<K extends keyof Tweaks>(key: K, value: Tweaks[K]) {
    if (!allowOverride) return;
    setTweaks((t) => ({ ...t, [key]: value }));
    setCookie(TWEAK_COOKIE[key], String(value));
    if (key === 'density' || key === 'saturation') {
      applyHtmlAttr(key, String(value));
    }
    if (key === 'heatmapDays' || key === 'heroVariant') {
      // 服务端读 cookie 重新渲染（page.tsx / incidents / maintenance 用 cookies() 取值）
      router.refresh();
    }
  }

  /** 重置 = 清空 cookie,让服务端下次渲染回到 admin 默认值。 */
  function reset() {
    if (!allowOverride) return;
    const target = adminDefaults ?? initial;
    setTweaks(target);
    clearCookie(TWEAK_COOKIE.density);
    clearCookie(TWEAK_COOKIE.saturation);
    clearCookie(TWEAK_COOKIE.heatmapDays);
    clearCookie(TWEAK_COOKIE.heroVariant);
    applyHtmlAttr('density', target.density);
    applyHtmlAttr('saturation', target.saturation);
    setTheme('system');
    router.refresh();
  }

  const currentTheme = (mounted ? theme : 'system') as 'light' | 'dark' | 'system';

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        aria-label="界面设置"
        aria-expanded={open}
        title="界面设置"
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          zIndex: 50,
          width: 40,
          height: 40,
          borderRadius: 999,
          border: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          color: 'var(--fg)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow)',
          cursor: 'pointer',
        }}
      >
        <Settings className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Tweaks"
          style={{
            position: 'fixed',
            right: 18,
            bottom: 70,
            zIndex: 50,
            width: 280,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            padding: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>Tweaks</span>
            {allowOverride && (
              <button
                type="button"
                onClick={reset}
                style={{
                  fontSize: 11,
                  color: 'var(--fg-muted)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                重置
              </button>
            )}
          </div>

          {!allowOverride && (
            <div
              style={{
                fontSize: 11,
                padding: '6px 8px',
                marginBottom: 10,
                color: 'var(--fg-muted)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                lineHeight: 1.4,
              }}
            >
              站点管理员已锁定外观,以下选项不可修改。
            </div>
          )}

          <div
            style={{
              opacity: allowOverride ? 1 : 0.55,
              pointerEvents: allowOverride ? 'auto' : 'none',
            }}
          >
            <Section label="主题">
              <Segment
                ariaLabel="主题"
                options={[
                  { value: 'light', label: '浅色', Icon: Sun },
                  { value: 'dark', label: '深色', Icon: Moon },
                  { value: 'system', label: '系统', Icon: Monitor },
                ]}
                value={currentTheme}
                onChange={(v) => setTheme(v)}
              />
            </Section>

            <Section label="信息密度">
              <Segment
                ariaLabel="信息密度"
                options={DENSITY_VALUES.map((v) => ({ value: v, label: DENSITY_LABEL[v] }))}
                value={tweaks.density}
                onChange={(v) => patch('density', v as Density)}
              />
            </Section>

            <Section label="状态色饱和度">
              <Segment
                ariaLabel="状态色饱和度"
                options={SATURATION_VALUES.map((v) => ({ value: v, label: SATURATION_LABEL[v] }))}
                value={tweaks.saturation}
                onChange={(v) => patch('saturation', v as Saturation)}
              />
            </Section>

            <Section label="Heatmap 天数">
              <Segment
                ariaLabel="Heatmap 天数"
                options={HEATMAP_DAY_VALUES.map((v) => ({ value: String(v), label: `${v}d` }))}
                value={String(tweaks.heatmapDays)}
                onChange={(v) => patch('heatmapDays', Number(v) as HeatmapDays)}
              />
            </Section>

            <Section label="Hero 版式">
              <Segment
                ariaLabel="Hero 版式"
                options={HERO_VARIANT_VALUES.map((v) => ({ value: v, label: HERO_LABEL[v] }))}
                value={tweaks.heroVariant}
                onChange={(v) => patch('heroVariant', v as HeroVariant)}
              />
            </Section>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--fg-subtle)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

interface SegmentOpt<T extends string> {
  value: T;
  label: string;
  Icon?: React.ComponentType<{ className?: string }>;
}

function Segment<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentOpt<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const groupId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusIndex(i: number) {
    const len = options.length;
    const target = ((i % len) + len) % len;
    refs.current[target]?.focus();
    onChange(options[target]!.value);
  }

  function handleKey(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusIndex(idx + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusIndex(idx - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusIndex(options.length - 1);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      id={groupId}
      style={{
        display: 'inline-flex',
        width: '100%',
        gap: 2,
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: 2,
      }}
    >
      {options.map((opt, idx) => {
        const active = opt.value === value;
        const Icon = opt.Icon;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKey(e, idx)}
            className={cn('flex-1')}
            style={{
              flex: 1,
              height: 26,
              borderRadius: 'calc(var(--radius-sm) - 2px)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              background: active ? 'var(--bg-elevated)' : 'transparent',
              color: active ? 'var(--fg)' : 'var(--fg-muted)',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
