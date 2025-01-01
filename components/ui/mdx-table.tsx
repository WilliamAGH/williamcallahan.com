import React from 'react';

import type { DetailedHTMLProps, TableHTMLAttributes, HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react';

type TableProps = DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>;
type TheadProps = DetailedHTMLProps<HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>;
type TrProps = DetailedHTMLProps<HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement>;
type ThProps = DetailedHTMLProps<ThHTMLAttributes<HTMLTableHeaderCellElement>, HTMLTableHeaderCellElement>;
type TdProps = DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>;

export const MDXTable: React.FC<TableProps> = ({ children, ...props }) => {
  return (
    <div className="my-8 overflow-hidden rounded-xl bg-white/50 dark:bg-gray-800/50 shadow-xl ring-1 ring-black/5 dark:ring-white/5">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <colgroup>
            <col className="w-1/2" />
            <col className="w-1/2" />
          </colgroup>
          {children}
        </table>
      </div>
    </div>
  );
};

export const MDXTableHeader: React.FC<TheadProps> = ({ children, ...props }) => {
  return (
    <thead>
      <tr className="bg-gray-50/80 dark:bg-gray-800/80">
        {children}
      </tr>
    </thead>
  );
};

export const MDXTableRow: React.FC<TrProps> = ({ children, ...props }) => {
  return (
    <tr className="transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 last:border-0">
      {children}
    </tr>
  );
};

export const MDXTableHeaderCell: React.FC<ThProps> = ({ children, ...props }) => {
  return (
    <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
      {children}
    </th>
  );
};

export const MDXTableCell: React.FC<TdProps> = ({ children, ...props }) => {
  const content = children?.toString() || '';
  const isNumeric = /^[€$]?\d/.test(content);
  const isNegative = content.includes('-');
  const isPositive = content.includes('+');

  return (
    <td className={`px-6 py-4 text-sm font-medium ${
      isNumeric
        ? `text-right tabular-nums tracking-tight ${
            isNegative
              ? 'text-red-600 dark:text-red-400'
              : isPositive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-gray-900 dark:text-gray-100'
          }`
        : 'text-left text-gray-600 dark:text-gray-300'
    }`}>
      {isNumeric ? (
        <span className="inline-block min-w-[140px]">{children}</span>
      ) : (
        children
      )}
    </td>
  );
};
