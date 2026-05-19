import type { ReactNode } from 'react';
import { Icon, type IconName } from './icon';

type Tone = 'neutral' | 'rose' | 'amber' | 'blue' | 'green';

const TONE_COLOR: Record<Tone, string> = {
  neutral: 'var(--fg)',
  rose: 'var(--st-major)',
  amber: 'var(--st-deg)',
  blue: 'var(--st-maint)',
  green: 'var(--st-op)',
};

export function StatCard({
  label,
  value,
  sub,
  delta,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: string;
  tone?: Tone;
  icon?: IconName;
}) {
  const deltaPos = typeof delta === 'string' && delta.startsWith('+');
  return (
    <div className="card lift" style={{ padding: 18, cursor: 'pointer' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span
          className="subtle"
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        {icon && (
          <span style={{ color: 'var(--fg-subtle)' }}>
            <Icon d={icon} size={14} />
          </span>
        )}
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <span
          className="tabular"
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: TONE_COLOR[tone],
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </span>
        {delta && (
          <span
            className="tabular"
            style={{
              fontSize: 12,
              color: deltaPos ? 'var(--st-op)' : 'var(--st-major)',
            }}
          >
            {delta}
          </span>
        )}
      </div>
      {sub && (
        <div className="subtle" style={{ fontSize: 11.5, marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
