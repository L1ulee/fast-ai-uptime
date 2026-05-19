'use client';

import { type ReactNode, useMemo, useRef, useState, useTransition } from 'react';
import { PageHeader } from '@/components/admin/forms';
import { Icon } from '@/components/admin/icon';
import type { SettingsConfig } from '@/lib/admin/settings';
import { shortTzLabel } from '@/lib/timezone';

/** 列出所有 IANA 时区,按当前 UTC 偏移升序、再按名称排序。Fallback 给老浏览器。 */
function allTimezones(): Array<{ value: string; label: string; offsetMin: number }> {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  const raw =
    typeof intl.supportedValuesOf === 'function'
      ? intl.supportedValuesOf('timeZone')
      : [
          'UTC',
          'Asia/Shanghai',
          'Asia/Tokyo',
          'Europe/London',
          'America/New_York',
          'America/Los_Angeles',
        ];
  const fmtOffset = (tz: string): { mins: number; label: string } => {
    try {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
        year: 'numeric',
      });
      const parts = dtf.formatToParts(new Date());
      const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
      // 形如 "GMT+8" / "GMT+05:30" / "GMT"
      const m = name.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/i);
      if (!m) return { mins: 0, label: 'UTC' };
      const sign = m[1] === '-' ? -1 : 1;
      const hh = Number(m[2] ?? 0);
      const mm = Number(m[3] ?? 0);
      const mins = sign * (hh * 60 + mm);
      const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
      const label = `UTC${sign >= 0 ? '+' : '-'}${pad(hh)}:${pad(mm)}`;
      return { mins, label };
    } catch {
      return { mins: 0, label: 'UTC' };
    }
  };
  return raw
    .map((tz) => {
      const { mins, label } = fmtOffset(tz);
      return { value: tz, label: `${tz} · ${label}`, offsetMin: mins };
    })
    .sort((a, b) => a.offsetMin - b.offsetMin || a.value.localeCompare(b.value));
}

interface LogoValue {
  name: string;
  url: string;
}

// — Reusable "settings section" with left rail (label + desc) + right column (form) —
function SettingsSection({
  id,
  title,
  description,
  children,
  footer,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section id={id} className="card" style={{ padding: 0, scrollMarginTop: 32 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 0 }}>
        <div style={{ padding: '22px 24px', borderRight: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>
            {title}
          </h2>
          {description && (
            <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.5 }}>
              {description}
            </p>
          )}
        </div>
        <div style={{ padding: '22px 24px' }}>{children}</div>
      </div>
      {footer && (
        <div
          style={{
            padding: '12px 24px',
            background: 'var(--bg-subtle)',
            borderTop: '1px solid var(--border)',
            borderBottomLeftRadius: 'var(--radius)',
            borderBottomRightRadius: 'var(--radius)',
          }}
        >
          {footer}
        </div>
      )}
    </section>
  );
}

// — Field group (matches admin Field) —
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--fg-muted)',
          display: 'block',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// — Inline switch —
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 13,
      }}
    >
      <span
        style={{
          position: 'relative',
          width: 32,
          height: 18,
          borderRadius: 999,
          background: checked ? 'var(--brand)' : 'var(--border-strong)',
          transition: 'background 140ms ease',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 16 : 2,
            width: 14,
            height: 14,
            borderRadius: 999,
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            transition: 'left 140ms ease',
          }}
        />
      </span>
      {label && <span style={{ color: 'var(--fg)' }}>{label}</span>}
    </button>
  );
}

// — Inline switch + descriptor row (for settings) —
function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="row"
      style={{
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 14,
        padding: '4px 0',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{label}</div>
        {hint && (
          <div className="subtle" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.5 }}>
            {hint}
          </div>
        )}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

/** 文件 → data URL。 */
function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('文件读取失败'));
    r.readAsDataURL(f);
  });
}

/** data URL → HTMLImageElement。 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败,可能为不支持的格式'));
    img.src = src;
  });
}

/**
 * 智能预处理:
 *  - SVG / ICO 矢量格式原样保留(canvas 缩放会丢矢量)。
 *  - 栅格图(png/jpeg/webp/avif/gif/bmp):若尺寸或字节数超阈值,等比缩放到
 *    maxDim 内,重编码为 webp(质量 0.92);否则保持原样。
 */
async function prepareLogoDataUrl(file: File, maxDim: number): Promise<string> {
  const orig = await fileToDataUrl(file);
  const type = file.type.toLowerCase();
  if (type === 'image/svg+xml' || type.includes('icon')) return orig;
  const img = await loadImage(orig);
  const { naturalWidth: w, naturalHeight: h } = img;
  // 已经够小:不重压缩(避免无谓的损失)。
  if (w <= maxDim && h <= maxDim && file.size <= 256 * 1024) return orig;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 不可用');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, tw, th);
  // 优先 webp(浏览器支持广、压缩好);失败回退 PNG。
  try {
    return canvas.toDataURL('image/webp', 0.92);
  } catch {
    return canvas.toDataURL('image/png');
  }
}

const ACCEPTED_IMAGE_TYPES =
  'image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// — Logo uploader (preview + replace + remove) —
function LogoUploader({
  shape = 'square',
  value,
  onChange,
  hint,
  size = 56,
  /** 缩放上限(像素)。Logo 用默认 512;favicon 类小图建议传 128。 */
  targetMaxPx = 512,
}: {
  shape?: 'square' | 'circle';
  value: LogoValue | null;
  onChange: (v: LogoValue | null) => void;
  hint?: string;
  size?: number;
  targetMaxPx?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      alert(`图片需小于 5 MB(当前 ${(f.size / 1024 / 1024).toFixed(2)} MB)。`);
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await prepareLogoDataUrl(f, targetMaxPx);
      onChange({ name: f.name, url: dataUrl });
    } catch (err) {
      alert(`处理失败:${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: shape === 'circle' ? 999 : 10,
          background: value ? 'transparent' : 'var(--bg-subtle)',
          border: '1px solid var(--border)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value.url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div
            style={{
              color: 'var(--fg-subtle)',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.04em',
            }}
          >
            FAU
          </div>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? '处理中…' : value ? '替换' : '上传'}
          </button>
          {value && !busy && (
            <button
              type="button"
              className="btn btn-sm btn-ghost btn-danger"
              onClick={() => onChange(null)}
            >
              移除
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            style={{ display: 'none' }}
            onChange={onPick}
          />
        </div>
        <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
          {value ? (
            <span className="mono">{value.name}</span>
          ) : (
            hint ||
            `PNG / JPEG / WebP / AVIF / GIF / BMP / SVG / ICO,≤ 5 MB(超过 ${targetMaxPx}px 自动缩放)`
          )}
        </div>
      </div>
    </div>
  );
}

// — Color swatch picker (curated + free input) —
function ColorPicker({
  value,
  onChange,
  presets,
}: {
  value: string;
  onChange: (v: string) => void;
  presets: string[];
}) {
  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      {presets.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`选择 ${c}`}
          style={{
            all: 'unset',
            width: 28,
            height: 28,
            borderRadius: 8,
            cursor: 'pointer',
            background: c,
            boxShadow:
              value.toLowerCase() === c.toLowerCase()
                ? '0 0 0 2px var(--bg-elevated), 0 0 0 4px var(--fg)'
                : '0 0 0 1px rgba(0,0,0,0.15)',
            transition: 'box-shadow 120ms',
          }}
        />
      ))}
      <div className="row" style={{ gap: 6, marginLeft: 6 }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 28,
            height: 28,
            padding: 0,
            border: '1px solid var(--border)',
            borderRadius: 6,
            cursor: 'pointer',
            background: 'transparent',
          }}
        />
        <input
          className="input mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 100, height: 30, fontSize: 12 }}
        />
      </div>
    </div>
  );
}

// — Segmented control —
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        padding: 2,
        background: 'var(--bg-subtle)',
        borderRadius: 8,
        border: '1px solid var(--border)',
      }}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '5px 12px',
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: active ? 500 : 400,
              color: active ? 'var(--fg)' : 'var(--fg-muted)',
              background: active ? 'var(--bg-elevated)' : 'transparent',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 120ms',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// — Danger row —
function DangerRow({
  title,
  desc,
  btn,
  divider,
}: {
  title: string;
  desc: string;
  btn: ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className="row"
      style={{
        padding: '14px 16px',
        justifyContent: 'space-between',
        gap: 14,
        borderBottom: divider ? '1px solid var(--border)' : 'none',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div className="subtle" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.5 }}>
          {desc}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{btn}</div>
    </div>
  );
}

// — Anchor chip nav —
const SECTIONS = [
  { id: 'site', label: '站点信息' },
  { id: 'branding', label: '品牌' },
  { id: 'public', label: '公开页' },
  { id: 'tweaks', label: 'Tweaks' },
  { id: 'probe', label: '探测' },
  { id: 'logs', label: '日志' },
  { id: 'danger', label: '危险区域' },
];

function logoToValue(s: string | null): LogoValue | null {
  return s ? { name: '已保存的图片', url: s } : null;
}

export function SettingsForm({
  initial,
  saveSettings,
  exportAllData,
  clearProbeHistory,
  resetSettings,
}: {
  initial: SettingsConfig;
  saveSettings: (raw: unknown) => Promise<void>;
  exportAllData: () => Promise<string>;
  clearProbeHistory: () => Promise<void>;
  resetSettings: () => Promise<void>;
}) {
  const [site, setSite] = useState(initial.site);
  const [logo, setLogo] = useState<LogoValue | null>(logoToValue(initial.branding.logoLight));
  const [logoDark, setLogoDark] = useState<LogoValue | null>(
    logoToValue(initial.branding.logoDark),
  );
  const [favicon, setFavicon] = useState<LogoValue | null>(logoToValue(initial.branding.favicon));
  const [brandColor, setBrandColor] = useState(initial.branding.brandColor);
  const [publicCfg, setPublicCfg] = useState(initial.public);
  const [tweaksCfg, setTweaksCfg] = useState(initial.tweaks);
  const [probeCfg, setProbeCfg] = useState(initial.probe);
  const [logsCfg, setLogsCfg] = useState(initial.logs);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isSaving, startSave] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  // 时区列表稳定 —— 仅按当前偏移计算一次,SSR 与 CSR 一致(suppressHydrationWarning 已在 html 上)。
  const timezoneOptions = useMemo(() => allTimezones(), []);

  // touch-tracker — any wrapped setter triggers dirty
  function wrap<T>(setter: (v: T) => void): (v: T) => void {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }
  const setSiteD = wrap(setSite);
  const setPublicD = wrap(setPublicCfg);
  const setTweaksD = wrap(setTweaksCfg);
  const setProbeD = wrap(setProbeCfg);
  const setLogsD = wrap(setLogsCfg);
  const setLogoD = wrap(setLogo);
  const setLogoDarkD = wrap(setLogoDark);
  const setFaviconD = wrap(setFavicon);
  const setBrandColorD = wrap(setBrandColor);

  const buildPayload = (): SettingsConfig => ({
    site,
    branding: {
      logoLight: logo?.url ?? null,
      logoDark: logoDark?.url ?? null,
      favicon: favicon?.url ?? null,
      brandColor,
    },
    public: publicCfg,
    tweaks: tweaksCfg,
    probe: probeCfg,
    logs: logsCfg,
  });

  const onSave = () => {
    startSave(async () => {
      try {
        await saveSettings(buildPayload());
        setDirty(false);
        setSavedAt(new Date());
      } catch (err) {
        alert(`保存失败：${err instanceof Error ? err.message : String(err)}`);
      }
    });
  };

  const onReset = () => {
    if (!confirm('放弃所有未保存更改？')) return;
    setSite(initial.site);
    setLogo(logoToValue(initial.branding.logoLight));
    setLogoDark(logoToValue(initial.branding.logoDark));
    setFavicon(logoToValue(initial.branding.favicon));
    setBrandColor(initial.branding.brandColor);
    setPublicCfg(initial.public);
    setTweaksCfg(initial.tweaks);
    setProbeCfg(initial.probe);
    setLogsCfg(initial.logs);
    setDirty(false);
  };

  const onExport = async () => {
    setBusy('export');
    try {
      const json = await exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fau-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const onClearHistory = async () => {
    if (!confirm('确认清空全部探测样本？聚合可用率会被重置，且不可撤销。')) return;
    setBusy('clear');
    try {
      await clearProbeHistory();
      alert('探测历史已清空。');
    } catch (err) {
      alert(`操作失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const onResetAll = async () => {
    if (!confirm('确认重置全部设置为默认值？品牌资产与所有显示配置会被清除。')) return;
    setBusy('reset');
    try {
      await resetSettings();
      // 重置后回到初始默认：刷新页面拿最新默认值
      window.location.reload();
    } catch (err) {
      alert(`操作失败：${err instanceof Error ? err.message : String(err)}`);
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="系统设置"
        description="管理站点信息、品牌资产、公开页与探测默认值。仅 Admin 可见。"
      />

      {/* Anchor chip nav */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: 'var(--bg)',
          marginBottom: 18,
          padding: '6px 0',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(s.id);
              if (!el) return;
              const scroller = el.closest('main');
              if (scroller) scroller.scrollTo({ top: el.offsetTop - 60, behavior: 'smooth' });
              else
                window.scrollTo({
                  top: el.getBoundingClientRect().top + window.scrollY - 60,
                  behavior: 'smooth',
                });
            }}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: 12.5,
              color: 'var(--fg-muted)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              textDecoration: 'none',
            }}
          >
            {s.label}
          </a>
        ))}
        <div style={{ flex: 1 }} />
        {savedAt && !dirty && (
          <span className="subtle row" style={{ fontSize: 11.5, gap: 6 }}>
            <Icon d="check" size={12} stroke={2.5} /> 已保存
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* ——— Site ——— */}
        <SettingsSection
          id="site"
          title="站点信息"
          description="对外展示的名称、URL 与默认元数据。"
        >
          <Field label="站点名称">
            <input
              className="input"
              value={site.name}
              onChange={(e) => setSiteD({ ...site, name: e.target.value })}
            />
          </Field>
          <Field label="公开 URL" hint="用于通知、Webhook 与公开页 canonical 链接。">
            <input
              className="input mono"
              value={site.url}
              onChange={(e) => setSiteD({ ...site, url: e.target.value })}
            />
          </Field>
          <Field label="站点描述" hint="显示在公开页 meta description 与 OG 卡片中。">
            <textarea
              className="textarea"
              rows={2}
              value={site.description}
              onChange={(e) => setSiteD({ ...site, description: e.target.value })}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="支持邮箱">
              <input
                className="input mono"
                value={site.supportEmail}
                onChange={(e) => setSiteD({ ...site, supportEmail: e.target.value })}
              />
            </Field>
            <Field label="默认时区" hint="影响全站时间统计与显示;管理员录入的时间也按此时区解释。">
              <select
                className="select"
                value={site.timezone}
                onChange={(e) => setSiteD({ ...site, timezone: e.target.value })}
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="界面语言"
              hint="影响导航/页脚等未做双语标记部分;已有 zh+en 混排的业务文案保持原样。"
            >
              <select
                className="select"
                value={site.language}
                onChange={(e) =>
                  setSiteD({ ...site, language: e.target.value as typeof site.language })
                }
              >
                <option value="zh">简体中文</option>
                <option value="en">English</option>
              </select>
            </Field>
          </div>
        </SettingsSection>

        {/* ——— Branding ——— */}
        <SettingsSection
          id="branding"
          title="品牌"
          description="Logo、Favicon 与主色。会同步影响公开页、登录页与管理后台。"
        >
          <Field label="Logo（浅色）" hint="用于浅色背景。建议透明 PNG 或 SVG。">
            <LogoUploader value={logo} onChange={(v) => setLogoD(v)} />
          </Field>
          <Field label="Logo（深色）" hint="深色主题下使用；留空则反色显示浅色版本。">
            <LogoUploader value={logoDark} onChange={(v) => setLogoDarkD(v)} />
          </Field>
          <Field label="Favicon" hint="支持 PNG / SVG / ICO,自动缩放到 128px 以内。">
            <LogoUploader
              shape="square"
              size={40}
              value={favicon}
              onChange={(v) => setFaviconD(v)}
              targetMaxPx={128}
              hint="任意尺寸,自动缩放;≤ 5 MB"
            />
          </Field>
          <Field label="品牌主色" hint="用于按钮、链接、激活状态。">
            <ColorPicker
              value={brandColor}
              onChange={(v) => setBrandColorD(v)}
              presets={[
                '#34d399',
                '#10b981',
                '#3b82f6',
                '#8b5cf6',
                '#f59e0b',
                '#ef4444',
                '#0f172a',
              ]}
            />
          </Field>
        </SettingsSection>

        {/* ——— Public page ——— */}
        <SettingsSection
          id="public"
          title="公开页"
          description="对外公开状态页的默认外观与可见性。"
        >
          <Field label="Hero 版式">
            <Segmented
              value={publicCfg.heroVariant}
              onChange={(v) => setPublicD({ ...publicCfg, heroVariant: v })}
              options={[
                { value: 'panel', label: '面板' },
                { value: 'minimal', label: '极简' },
                { value: 'split', label: '双栏' },
              ]}
            />
          </Field>
          <Field label="Heatmap 默认天数">
            <Segmented
              value={String(publicCfg.heatmapDays)}
              onChange={(v) => setPublicD({ ...publicCfg, heatmapDays: Number(v) as 30 | 60 | 90 })}
              options={[
                { value: '30', label: '30 天' },
                { value: '60', label: '60 天' },
                { value: '90', label: '90 天' },
              ]}
            />
          </Field>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
            <SwitchRow
              label="允许搜索引擎索引"
              hint="关闭后将注入 noindex meta，并屏蔽 robots.txt。"
              checked={publicCfg.allowIndexing}
              onChange={(v) => setPublicD({ ...publicCfg, allowIndexing: v })}
            />
            <SwitchRow
              label="显示订阅入口"
              hint="在公开页头部展示 Email / Webhook 订阅按钮。"
              checked={publicCfg.showSubscribe}
              onChange={(v) => setPublicD({ ...publicCfg, showSubscribe: v })}
            />
            <SwitchRow
              label='显示 "Powered by Fast AI Uptime"'
              hint="保留版权链接，付费版可关闭。"
              checked={publicCfg.showPoweredBy}
              onChange={(v) => setPublicD({ ...publicCfg, showPoweredBy: v })}
            />
          </div>
        </SettingsSection>

        {/* ——— Tweaks ——— */}
        <SettingsSection
          id="tweaks"
          title="Tweaks"
          description="访客可见的实时外观切换面板的默认状态与允许的覆盖项。"
        >
          <SwitchRow
            label="启用 Tweaks 面板"
            hint="访客可在公开页切换主题、密度等外观选项。"
            checked={tweaksCfg.enabled}
            onChange={(v) => setTweaksD({ ...tweaksCfg, enabled: v })}
          />
          <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
          <div
            style={{
              opacity: tweaksCfg.enabled ? 1 : 0.45,
              pointerEvents: tweaksCfg.enabled ? 'auto' : 'none',
            }}
          >
            <Field label="默认主题">
              <Segmented
                value={tweaksCfg.defaultTheme}
                onChange={(v) => setTweaksD({ ...tweaksCfg, defaultTheme: v })}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'system', label: 'System' },
                ]}
              />
            </Field>
            <Field label="默认密度">
              <Segmented
                value={tweaksCfg.defaultDensity}
                onChange={(v) => setTweaksD({ ...tweaksCfg, defaultDensity: v })}
                options={[
                  { value: 'compact', label: '紧凑' },
                  { value: 'standard', label: '标准' },
                  { value: 'comfortable', label: '宽松' },
                ]}
              />
            </Field>
            <Field label="状态色饱和度">
              <Segmented
                value={tweaksCfg.defaultSaturation}
                onChange={(v) => setTweaksD({ ...tweaksCfg, defaultSaturation: v })}
                options={[
                  { value: 'muted', label: '柔和' },
                  { value: 'rich', label: '鲜明' },
                ]}
              />
            </Field>
            <SwitchRow
              label="允许访客覆盖默认值"
              hint="关闭后访客只能看到管理员设置的默认外观。"
              checked={tweaksCfg.allowVisitorOverride}
              onChange={(v) => setTweaksD({ ...tweaksCfg, allowVisitorOverride: v })}
            />
          </div>
        </SettingsSection>

        {/* ——— Probe defaults ——— */}
        <SettingsSection
          id="probe"
          title="探测默认值"
          description="新建组件时的默认请求设置。已存在的组件不受影响。"
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="默认探测间隔（秒）">
              <input
                className="input tabular"
                type="number"
                min={10}
                step={10}
                value={probeCfg.intervalSec}
                onChange={(e) => setProbeD({ ...probeCfg, intervalSec: Number(e.target.value) })}
              />
            </Field>
            <Field label="默认超时（毫秒）">
              <input
                className="input tabular"
                type="number"
                min={1000}
                step={500}
                value={probeCfg.timeoutMs}
                onChange={(e) => setProbeD({ ...probeCfg, timeoutMs: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="默认重试次数" hint="失败后等待 2 秒重试。设为 0 表示不重试。">
            <input
              className="input tabular"
              type="number"
              min={0}
              max={5}
              value={probeCfg.retries}
              onChange={(e) => setProbeD({ ...probeCfg, retries: Number(e.target.value) })}
            />
          </Field>
          <Field label="User-Agent">
            <input
              className="input mono"
              value={probeCfg.userAgent}
              onChange={(e) => setProbeD({ ...probeCfg, userAgent: e.target.value })}
            />
          </Field>
        </SettingsSection>

        {/* ——— Logs ——— */}
        <SettingsSection
          id="logs"
          title="日志"
          description="日志分类保留、脱敏与外部转发。详细查询与导出请到 “日志管理”页面。"
        >
          <Field
            label="最低记录级别"
            hint="低于此级别的事件不会被写入。Debug 仅在调试环境推荐启用。"
          >
            <Segmented
              value={logsCfg.minLevel}
              onChange={(v) => setLogsD({ ...logsCfg, minLevel: v })}
              options={[
                { value: 'debug', label: 'Debug' },
                { value: 'info', label: 'Info' },
                { value: 'warn', label: 'Warn' },
                { value: 'error', label: 'Error' },
              ]}
            />
          </Field>

          <Field
            label="分类保留天数"
            hint="超过保留天数的日志将在每日清理任务中删除。审计日志建议至少 365 天。"
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {(
                [
                  { k: 'audit', l: '审计' },
                  { k: 'probe', l: '探测' },
                  { k: 'webhook', l: 'Webhook' },
                  { k: 'system', l: '系统' },
                ] as Array<{ k: keyof typeof logsCfg.retention; l: string }>
              ).map((row) => (
                <div key={row.k}>
                  <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 4 }}>
                    {row.l}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input tabular"
                      type="number"
                      min={1}
                      max={3650}
                      value={logsCfg.retention[row.k]}
                      onChange={(e) =>
                        setLogsD({
                          ...logsCfg,
                          retention: {
                            ...logsCfg.retention,
                            [row.k]: Number(e.target.value),
                          },
                        })
                      }
                      style={{ paddingRight: 36 }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: 11,
                        color: 'var(--fg-subtle)',
                        pointerEvents: 'none',
                      }}
                    >
                      天
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Field>

          <Field
            label="采样率"
            hint="仅记录探测成功事件的指定百分比，减少存储压力。Error、Warn 与审计日志始终 100% 记录。"
          >
            <div className="row" style={{ gap: 12 }}>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={logsCfg.samplingRate}
                onChange={(e) => setLogsD({ ...logsCfg, samplingRate: Number(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span
                className="tabular"
                style={{ fontSize: 13, fontWeight: 600, minWidth: 48, textAlign: 'right' }}
              >
                {logsCfg.samplingRate}%
              </span>
            </div>
          </Field>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
            <SwitchRow
              label="脱敏 Authorization 与 API Key"
              hint="在写入前自动将请求头中的 Authorization、Cookie、x-api-key 等替换为 “•••”。"
              checked={logsCfg.redactAuth}
              onChange={(v) => setLogsD({ ...logsCfg, redactAuth: v })}
            />
            <SwitchRow
              label="记录请求 / 响应 Body"
              hint="启用后探测请求与返回 Body 将完整写入日志（受脱敏规则影响）。"
              checked={logsCfg.redactBody}
              onChange={(v) => setLogsD({ ...logsCfg, redactBody: v })}
            />
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '18px 0 14px' }} />

          <SwitchRow
            label="转发到外部"
            hint="同步写入到外部日志服务（Loki / Datadog / S3 等）。"
            checked={logsCfg.forward.enabled}
            onChange={(v) => setLogsD({ ...logsCfg, forward: { ...logsCfg.forward, enabled: v } })}
          />

          <div
            style={{
              opacity: logsCfg.forward.enabled ? 1 : 0.45,
              pointerEvents: logsCfg.forward.enabled ? 'auto' : 'none',
              marginTop: 14,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
              <Field label="Sink URL">
                <input
                  className="input mono"
                  placeholder="https://logs.example.com/ingest"
                  value={logsCfg.forward.url}
                  onChange={(e) =>
                    setLogsD({
                      ...logsCfg,
                      forward: { ...logsCfg.forward, url: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="格式">
                <select
                  className="select"
                  value={logsCfg.forward.format}
                  onChange={(e) =>
                    setLogsD({
                      ...logsCfg,
                      forward: {
                        ...logsCfg.forward,
                        format: e.target.value as 'json' | 'ndjson' | 'otlp',
                      },
                    })
                  }
                >
                  <option value="json">JSON</option>
                  <option value="ndjson">NDJSON</option>
                  <option value="otlp">OTLP</option>
                </select>
              </Field>
            </div>
          </div>

          <Field
            label="清理任务运行时间"
            hint={`按站点时区 (${site.timezone}) 解释。每日运行一次,清理超过保留天数的日志。`}
          >
            <select
              className="select"
              value={logsCfg.cleanupHour}
              onChange={(e) => setLogsD({ ...logsCfg, cleanupHour: Number(e.target.value) })}
              style={{ width: 200 }}
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00 {shortTzLabel(site.timezone)}
                </option>
              ))}
            </select>
          </Field>
        </SettingsSection>

        {/* ——— Danger zone ——— */}
        <SettingsSection id="danger" title="危险区域" description="这些操作不可撤销。请谨慎执行。">
          <div className="card" style={{ borderColor: 'var(--st-major)', padding: 0 }}>
            <DangerRow
              title="导出全部数据"
              desc="包含组件、事件、维护、订阅与系统设置，导出为 .json。不含探测样本与日志。"
              btn={
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={onExport}
                  disabled={busy === 'export'}
                >
                  <Icon d="ext" size={12} /> {busy === 'export' ? '导出中…' : '导出'}
                </button>
              }
              divider
            />
            <DangerRow
              title="清空探测历史"
              desc="移除所有探测样本与 5 分钟聚合。聚合可用率会被重置。"
              btn={
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={onClearHistory}
                  disabled={busy === 'clear'}
                >
                  {busy === 'clear' ? '清空中…' : '清空历史'}
                </button>
              }
              divider
            />
            <DangerRow
              title="重置全部设置为默认值"
              desc="保留组件和事件数据，但所有显示配置、品牌资产与 Tweaks 默认值会被重置。"
              btn={
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={onResetAll}
                  disabled={busy === 'reset'}
                >
                  {busy === 'reset' ? '重置中…' : '重置'}
                </button>
              }
            />
          </div>
        </SettingsSection>

        <div style={{ height: 80 }} />
      </div>

      {/* Floating save bar —— viewport fixed,居中,跟随窗口固定在底部。 */}
      <div
        aria-hidden={!dirty}
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 24,
          zIndex: 60,
          pointerEvents: dirty ? 'auto' : 'none',
          transform: `translateX(-50%) translateY(${dirty ? '0' : '12px'})`,
          opacity: dirty ? 1 : 0,
          transition: 'transform 200ms ease, opacity 200ms ease',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 18px 14px 20px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: 14,
          boxShadow: '0 16px 40px -10px rgba(0,0,0,0.4), 0 4px 10px rgba(0,0,0,0.18)',
          fontSize: 14,
          minWidth: 360,
        }}
      >
        <span className="row" style={{ gap: 10, color: 'var(--fg-muted)' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: 'var(--st-deg)',
              boxShadow: '0 0 0 4px color-mix(in oklab, var(--st-deg) 22%, transparent)',
            }}
          />
          有未保存的更改
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onReset} disabled={isSaving}>
          放弃
        </button>
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={isSaving}>
          {isSaving ? '保存中…' : '保存更改'}
        </button>
      </div>
    </div>
  );
}
