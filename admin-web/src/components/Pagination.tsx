'use client';

import Icon from './Icon';

interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Disables the controls when there is a single page or no data. */
  disabled?: boolean;
}

/** Builds a compact page list with ellipses, e.g. 1 … 4 5 6 … 12 */
function pageWindow(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const pages = new Set<number>([1, pageCount, page]);
  if (page - 1 > 1) pages.add(page - 1);
  if (page + 1 < pageCount) pages.add(page + 1);
  if (page <= 3) [2, 3, 4].forEach((n) => pages.add(n));
  if (page >= pageCount - 2)
    [pageCount - 1, pageCount - 2, pageCount - 3].forEach((n) => pages.add(n));

  const sorted = Array.from(pages)
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b);

  const result: (number | 'gap')[] = [];
  let previous = 0;
  for (const current of sorted) {
    if (previous && current - previous > 1) result.push('gap');
    result.push(current);
    previous = current;
  }
  return result;
}

export default function Pagination({
  page,
  pageCount,
  onPageChange,
  disabled = false,
}: PaginationProps) {
  if (pageCount <= 1) return null;

  const pages = pageWindow(page, pageCount);

  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        className="pagination__btn"
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || page <= 1}
        aria-label="Previous page"
      >
        <Icon name="chevron-left" size={16} />
      </button>

      {pages.map((entry, index) =>
        entry === 'gap' ? (
          <span key={`gap-${index}`} className="pagination__ellipsis" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            className={`pagination__btn${entry === page ? ' is-active' : ''}`}
            onClick={() => onPageChange(entry)}
            disabled={disabled}
            aria-current={entry === page ? 'page' : undefined}
            aria-label={`Page ${entry}`}
          >
            {entry}
          </button>
        )
      )}

      <button
        type="button"
        className="pagination__btn"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || page >= pageCount}
        aria-label="Next page"
      >
        <Icon name="chevron-right" size={16} />
      </button>
    </nav>
  );
}
