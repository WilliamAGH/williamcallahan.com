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

  // If parsing failed or no data, render a placeholder or nothing
  if (!hasValidData) {
    console.warn("ResponsiveTable: Parsing failed or no data, rendering empty.");
    // Optionally return a placeholder div or null
    return <div className={cn("my-6", className)} {...props}>Could not render responsive table data.</div>;
    // return null;
  }

  // Always render the grid layout if data is valid
  return (
    <div
      className={cn(
        "my-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2",
        "max-w-5xl mx-auto",
        className
      )}
      {...props}
      suppressHydrationWarning={true} // Add suppression here as structure differs from original table
    >
      {rows.map((row, rowIndex) => {
        const programPeriodIndex = headers.findIndex(h => /program period/i.test(String(h)));
        const investmentIndex = headers.findIndex(h => /investment/i.test(String(h)));
        const isEven = rowIndex % 2 === 0;

        return (
          <div
            key={`card-${rowIndex}`}
            className={cn(
              "flex flex-col",
              isEven ? "bg-gray-50 dark:bg-gray-800/70" : "bg-white dark:bg-gray-800/40",
              "border border-gray-300 dark:border-gray-600",
              "rounded-lg shadow-md overflow-hidden",
              "transition-colors duration-200 ease-in-out",
              "hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:border-blue-500 dark:hover:border-blue-400"
            )}
          >
            {/* Card Header (Program Period) */}
            {programPeriodIndex !== -1 && (
              <div className={cn(
                "px-5 py-3 border-b border-gray-300 dark:border-gray-600",
                isEven ? "bg-gray-100/80 dark:bg-gray-700/60" : "bg-gray-50/80 dark:bg-gray-700/40"
              )}>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  {headers[programPeriodIndex]}
                </div>
                <div className="text-lg font-bold font-mono text-gray-900 dark:text-gray-100">
                  {row[programPeriodIndex] ?? 'N/A'}
                </div>
              </div>
            )}

            {/* Card Body */}
            <div className="p-5 flex-grow">
              {headers.map((header, headerIndex) => {
                if (headerIndex === programPeriodIndex) return null;
                const isInvestment = headerIndex === investmentIndex;
                return (
                  <div key={`card-${rowIndex}-cell-${headerIndex}`} className="mb-4 last:mb-0">
                    <div className={cn(
                      "text-xs font-semibold uppercase tracking-wider mb-1.5",
                      isInvestment ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
                    )}>
                      {header}
                    </div>
                    <div className={cn(
                      "text-sm",
                      isInvestment
                        ? "text-xl font-bold font-mono text-gray-900 dark:text-gray-100"
                        : "text-gray-700 dark:text-gray-200 prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-a:text-blue-600 dark:prose-a:text-blue-400 hover:prose-a:underline"
                    )}>
                      {row[headerIndex] ?? <span className="italic text-gray-400 dark:text-gray-500">N/A</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}