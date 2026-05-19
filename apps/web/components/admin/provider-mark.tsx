// Colored squircle with brand letter, copied verbatim from Claude Design admin-pages-extra.jsx.

type ProviderKind = 'openai' | 'anthropic' | 'gemini' | 'custom';

const MAP: Record<ProviderKind, { bg: string; fg: string; mark: string }> = {
  openai: { bg: '#10a37f', fg: '#fff', mark: 'O' },
  anthropic: { bg: '#d97757', fg: '#fff', mark: 'A' },
  gemini: { bg: '#4285f4', fg: '#fff', mark: 'G' },
  custom: { bg: 'var(--bg-muted)', fg: 'var(--fg)', mark: '·' },
};

export function ProviderMark({
  type,
  size = 22,
}: {
  type: string | null | undefined;
  size?: number;
}) {
  const key = (type && type in MAP ? (type as ProviderKind) : 'custom') as ProviderKind;
  const m = MAP[key];
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: m.bg,
        color: m.fg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        fontWeight: 700,
        flexShrink: 0,
      }}
      aria-hidden
    >
      {m.mark}
    </span>
  );
}
