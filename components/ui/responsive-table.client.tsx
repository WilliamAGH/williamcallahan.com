'use client';

import React, { Children, isValidElement, useMemo, ReactNode, HTMLAttributes, useState, useEffect } from 'react';
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
  const [isMounted, setIsMounted] = useState(false);
  const { headers, rows } = useMemo(() => parseTableChildren(children), [children]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const hasValidData = headers.length > 0 && rows.length > 0;

  // Render original table structure before mounting or if parsing failed
  if (!isMounted || !hasValidData) {
    if (!hasValidData && isMounted) { // Only warn if mounted and still no valid data
      console.warn("ResponsiveTable: Parsing failed or no data, falling back to default table render.");
    }
    return (
      <div className={cn("my-6 overflow-x-auto", className)} {...props}>
        <table className="min-w-full w-full">{children}</table>
      </div>
    );
  }

  // Render the grid layout only after mounting and if data is valid
  return (
    <div
      className={cn(
        "my-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2", // Adjusted: Max 2 columns on large screens
        "max-w-5xl mx-auto", // Adjusted max width for 2 columns, centered
        className
      )}
      {...props}
    >
      {rows.map((row, rowIndex) => {
        // Find the index for specific headers to style them differently
        const programPeriodIndex = headers.findIndex(h => /program period/i.test(String(h)));
        const investmentIndex = headers.findIndex(h => /investment/i.test(String(h)));

        const isEven = rowIndex % 2 === 0;

        return (
          <div
            key={`card-${rowIndex}`}
            className={cn(
              "flex flex-col", // Ensure flex layout for content distribution
              // Alternating backgrounds for terminal feel
              isEven
                ? "bg-gray-50 dark:bg-gray-800/70"
                : "bg-white dark:bg-gray-800/40",
              "border border-gray-300 dark:border-gray-600", // Sharper borders
              "rounded-lg shadow-md overflow-hidden", // Less rounding, flatter shadow
              "transition-colors duration-200 ease-in-out", // Color transition on hover
              // Terminal-like hover: subtle background change and border highlight
              "hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:border-blue-500 dark:hover:border-blue-400"
            )}
          >
            {/* Card Header (Program Period) */}
            {programPeriodIndex !== -1 && (
              <div className={cn(
                "px-5 py-3 border-b border-gray-300 dark:border-gray-600",
                // Match header background slightly with card background for consistency
                isEven
                  ? "bg-gray-100/80 dark:bg-gray-700/60"
                  : "bg-gray-50/80 dark:bg-gray-700/40"
              )}>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  {headers[programPeriodIndex]}
                </div>
                <div className="text-lg font-bold font-mono text-gray-900 dark:text-gray-100"> {/* Monospace font */}
                  {row[programPeriodIndex] ?? 'N/A'}
                </div>
              </div>
            )}

            {/* Card Body */}
            <div className="p-5 flex-grow"> {/* Use flex-grow to ensure body takes remaining space */}
              {headers.map((header, headerIndex) => {
                // Skip the header if it was already used (Program Period)
                if (headerIndex === programPeriodIndex) return null;

                const isInvestment = headerIndex === investmentIndex;

                return (
                  <div key={`card-${rowIndex}-cell-${headerIndex}`} className="mb-4 last:mb-0">
                    <div className={cn(
                      "text-xs font-semibold uppercase tracking-wider mb-1.5",
                      // Accent color for Investment label
                      isInvestment ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
                    )}>
                      {header}
                    </div>
                    <div className={cn(
                      "text-sm",
                      isInvestment
                        ? "text-xl font-bold font-mono text-gray-900 dark:text-gray-100" // Larger, bold, monospace for investment amount
                        // Use prose for other fields, ensure links are visible
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