import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Page header — matches Claude Design `PageHeader` in admin-shell.jsx.
 * Title 22px, optional description on right of `actions`.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header
      style={{
        marginBottom: 24,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>
          {title}
        </h1>
        {description && (
          <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="row" style={{ gap: 8 }}>
          {actions}
        </div>
      )}
    </header>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="card" style={{ padding: 'var(--card-p)', marginBottom: 32 }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{title}</h2>
        {description && (
          <p className="subtle" style={{ fontSize: 12, marginTop: 3 }}>
            {description}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

/** Field group — matches Claude Design `Field` in admin-shell.jsx. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--fg-muted)',
            display: 'block',
            marginBottom: 6,
          }}
        >
          {label}
        </div>
      )}
      {children}
      {hint && (
        <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={cn('input', className)} {...rest} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea className={cn('textarea', className)} {...rest} />;
}

type ButtonSize = 'sm' | 'md';

interface SizedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
}

function sizeClass(size: ButtonSize | undefined): string {
  return size === 'md' ? '' : 'btn-sm';
}

export function PrimaryButton({ className, type = 'button', size, ...props }: SizedButtonProps) {
  return (
    <button type={type} className={cn('btn btn-primary', sizeClass(size), className)} {...props} />
  );
}

export function DangerButton({ className, type = 'button', size, ...props }: SizedButtonProps) {
  return (
    <button type={type} className={cn('btn btn-danger', sizeClass(size), className)} {...props} />
  );
}

export function GhostButton({ className, type = 'button', size, ...props }: SizedButtonProps) {
  return (
    <button type={type} className={cn('btn btn-ghost', sizeClass(size), className)} {...props} />
  );
}

/** Plain secondary button (no tone). Equivalent to `<button className="btn">` in the design. */
export function SecondaryButton({ className, type = 'button', size, ...props }: SizedButtonProps) {
  return <button type={type} className={cn('btn', sizeClass(size), className)} {...props} />;
}

/** Icon-only button: `btn btn-sm btn-ghost btn-icon`. */
export function IconButton({
  className,
  type = 'button',
  tone,
  ...props
}: SizedButtonProps & { tone?: 'ghost' | 'danger' }) {
  const toneClass = tone === 'danger' ? 'btn-danger' : 'btn-ghost';
  return (
    <button type={type} className={cn('btn btn-sm btn-icon', toneClass, className)} {...props} />
  );
}

export function Table({ children }: { children: ReactNode }) {
  return <table className="t">{children}</table>;
}

export function Th({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <th style={style}>{children}</th>;
}

export function Td({
  children,
  className,
  style,
  onClick,
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
  colSpan?: number;
}) {
  return (
    <td
      className={cn(className)}
      onClick={onClick}
      colSpan={colSpan}
      style={{ verticalAlign: 'middle', ...style }}
    >
      {children}
    </td>
  );
}

type Tone = 'neutral' | 'green' | 'amber' | 'rose' | 'blue' | 'orange' | 'violet';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'badge',
  green: 'badge badge-green',
  amber: 'badge badge-amber',
  rose: 'badge badge-rose',
  blue: 'badge badge-blue',
  orange: 'badge badge-orange',
  violet: 'badge badge-violet',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  style,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={cn(TONE_CLASS[tone], className)} style={style}>
      {children}
    </span>
  );
}

/** Divider line — matches `.divider`. */
export function Divider() {
  return <div className="divider" />;
}

/** Section heading h2 — matches design `<h2 className="section-h">`. */
export function SectionH({
  children,
  style,
}: {
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <h2 className="section-h" style={style}>
      {children}
    </h2>
  );
}
