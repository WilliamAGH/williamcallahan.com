'use client';

import React, { Children, isValidElement, useMemo, ReactNode, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// Helper types for parsing
type TableCell = ReactNode;
type TableRow = TableCell[];
type TableData = {
  headers: TableCell[];
  rows: TableRow[];
};

/**
 * Parses the children of a <table> element to extract headers and rows.
 */
function parseTableChildren(children: ReactNode): TableData {
  const headers: TableCell[] = [];
  const rows: TableRow[] = [];
  let headerProcessed = false;

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;

    const childProps = child.props as { children?: ReactNode }; // Type assertion for props

    // Process thead for headers
    if (child.type === 'thead' && !headerProcessed) {
      Children.forEach(childProps.children, (tr) => {
        if (isValidElement(tr) && tr.type === 'tr') {
          const trProps = tr.props as { children?: ReactNode }; // Type assertion
          Children.forEach(trProps.children, (th) => {
            if (isValidElement(th) && th.type === 'th') {
              const thProps = th.props as { children?: ReactNode }; // Type assertion
              headers.push(thProps.children);
            }
          });
          headerProcessed = true; // Only process the first thead
        }
      });
    }
    // Process tbody for rows
    else if (child.type === 'tbody') {
      Children.forEach(childProps.children, (tr) => {
        if (isValidElement(tr) && tr.type === 'tr') {
          const trProps = tr.props as { children?: ReactNode }; // Type assertion
          const currentRow: TableCell[] = [];
          Children.forEach(trProps.children, (td) => {
            if (isValidElement(td) && td.type === 'td') {
              const tdProps = td.props as { children?: ReactNode }; // Type assertion
              currentRow.push(tdProps.children);
            }
          });
          if (currentRow.length > 0) {
            rows.push(currentRow);
          }
        }
      });
    }
  });

  if (headers.length === 0 && rows.length > 0 && !headerProcessed) {
       console.warn("ResponsiveTable: Could not find <thead>, table might not render correctly on mobile.");
  }

  return { headers, rows };
}

interface ResponsiveTableProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode; // Expects children of a <table> element
}

export function ResponsiveTable({ children, className, ...props }: ResponsiveTableProps): JSX.Element {
  const { headers, rows } = useMemo(() => parseTableChildren(children), [children]);

  const hasValidData = headers.length > 0 && rows.length > 0;

  // If parsing failed or no data, render the fallback table
  if (!hasValidData) {
    console.warn("ResponsiveTable: Parsing failed or no data, falling back to default table render.");
    return (
      <div className={cn("my-6 overflow-x-auto", className)} {...props}>
        <table className="min-w-full w-full">{children}</table>
      </div>
    );
  }

  // If parsing succeeded, render ONLY the card layout
  return (
    <div className={cn("my-6", className)} {...props}>
      {/* Card layout */}
      <div className="space-y-4">
        {rows.map((row, rowIndex) => (
          <div
            key={`card-${rowIndex}`}
            className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md p-4 space-y-2"
          >
            {headers.map((header, headerIndex) => (
              <div key={`card-${rowIndex}-cell-${headerIndex}`}>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  {header}
                </div>
                <div className="text-sm text-gray-900 dark:text-gray-100">
                  {row[headerIndex] ?? 'N/A'}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}