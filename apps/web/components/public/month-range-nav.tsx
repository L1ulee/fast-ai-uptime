/**
 * 月份范围导航：左右箭头切换 3 个月窗口；当 offset=0 时禁用 next。
 * Server Component 版本，使用 <Link> 改 query 参数 ?offset=N。
 */
import Link from 'next/link';

interface Props {
  basePath: '/incidents' | '/maintenance';
  offset: number;
  rangeLabel: string;
}

export function MonthRangeNav({ basePath, offset, rangeLabel }: Props) {
  const prev = offset + 1;
  const next = Math.max(0, offset - 1);
  const nextDisabled = offset === 0;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        marginBottom: 40,
      }}
    >
      <Link
        href={{ pathname: basePath, query: { offset: String(prev) } }}
        aria-label="Previous range"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-subtle)',
          color: 'var(--fg-muted)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          textDecoration: 'none',
        }}
      >
        ‹
      </Link>
      <span className="muted" style={{ fontSize: 14 }}>
        {rangeLabel}
      </span>
      {nextDisabled ? (
        <span
          aria-disabled
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
            color: 'var(--fg-muted)',
            opacity: 0.4,
            cursor: 'not-allowed',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
          }}
        >
          ›
        </span>
      ) : (
        <Link
          href={
            next === 0
              ? { pathname: basePath }
              : { pathname: basePath, query: { offset: String(next) } }
          }
          aria-label="Next range"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
            color: 'var(--fg-muted)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          ›
        </Link>
      )}
    </div>
  );
}
