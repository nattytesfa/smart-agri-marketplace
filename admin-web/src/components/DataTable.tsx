'use client';

import { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import EmptyState from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyIcon?: IconName;
  /** Renders skeleton rows instead of an empty state. */
  loading?: boolean;
  skeletonRows?: number;
  /** Enables the leading checkbox column. */
  selectable?: boolean;
  selectedKeys?: string[];
  onToggleRow?: (key: string) => void;
  onToggleAll?: (keys: string[], checked: boolean) => void;
  caption?: string;
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyTitle = 'Nothing to show',
  emptyMessage = 'There is no data to display yet.',
  emptyIcon = 'inbox',
  loading = false,
  skeletonRows = 6,
  selectable = false,
  selectedKeys = [],
  onToggleRow,
  onToggleAll,
  caption,
}: DataTableProps<T>) {
  const totalColumns = columns.length + (selectable ? 1 : 0);
  const allSelected = data.length > 0 && data.every((item) => selectedKeys.includes(keyExtractor(item)));

  if (!loading && data.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        {caption ? <caption className="u-visually-hidden">{caption}</caption> : null}
        <thead>
          <tr>
            {selectable ? (
              <th style={{ width: '1%' }}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) =>
                      onToggleAll?.(
                        data.map(keyExtractor),
                        event.target.checked
                      )
                    }
                    aria-label="Select all rows on this page"
                  />
                </label>
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.key}
                className={column.align === 'right' ? 'u-right' : column.className}
                style={column.align === 'right' ? { textAlign: 'right' } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`}>
                  {selectable ? (
                    <td>
                      <span className="skeleton skeleton--text" style={{ width: '1rem', height: '1rem' }} />
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td key={column.key}>
                      <span
                        className="skeleton skeleton--text"
                        style={{ width: `${45 + ((rowIndex * 17 + column.key.length * 11) % 45)}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            : data.map((item) => {
                const key = keyExtractor(item);
                const selected = selectedKeys.includes(key);
                return (
                  <tr
                    key={key}
                    className={onRowClick ? 'table--clickable' : undefined}
                    onClick={onRowClick ? () => onRowClick(item) : undefined}
                  >
                    {selectable ? (
                      <td onClick={(event) => event.stopPropagation()}>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => onToggleRow?.(key)}
                            aria-label="Select row"
                          />
                        </label>
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={column.className}
                        style={column.align === 'right' ? { textAlign: 'right' } : undefined}
                      >
                        {column.render ? column.render(item) : (item[column.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
      {loading ? (
        <span className="u-visually-hidden" role="status">
          Loading table data
        </span>
      ) : null}
    </div>
  );
}
