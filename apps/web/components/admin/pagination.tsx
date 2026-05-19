import Link from 'next/link';

export const PAGE_SIZE = 20;

interface PaginationProps {
  /** 当前页（1-indexed） */
  page: number;
  /** 总记录数 */
  total: number;
  /** 当前路径，例 "/admin/incidents" */
  basePath: string;
  /** 翻页 query 参数名（默认 "page"），允许同页多个分页区域用不同参数 */
  paramName?: string;
}

export function Pagination({ page, total, basePath, paramName = 'page' }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pageCount <= 1) return null;

  return (
    <nav className="row" style={{ justifyContent: 'space-between', marginTop: 12, fontSize: 12 }}>
      <span className="subtle tabular">
        第 {page} / {pageCount} 页 · 共 {total} 条
      </span>
      <div className="row" style={{ gap: 4 }}>
        {page > 1 ? (
          <Link
            href={{ pathname: basePath, query: { [paramName]: String(page - 1) } }}
            className="btn btn-ghost btn-sm"
          >
            ← 上一页
          </Link>
        ) : (
          <span
            className="btn btn-ghost btn-sm subtle"
            style={{ pointerEvents: 'none', opacity: 0.4 }}
          >
            ← 上一页
          </span>
        )}
        {page < pageCount ? (
          <Link
            href={{ pathname: basePath, query: { [paramName]: String(page + 1) } }}
            className="btn btn-ghost btn-sm"
          >
            下一页 →
          </Link>
        ) : (
          <span
            className="btn btn-ghost btn-sm subtle"
            style={{ pointerEvents: 'none', opacity: 0.4 }}
          >
            下一页 →
          </span>
        )}
      </div>
    </nav>
  );
}

const MAX_PAGE = 10_000;

/** 解析查询参数中的页码，钳到 [1, MAX_PAGE]，防止 OFFSET 爆炸。 */
export function parsePage(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGE);
}
