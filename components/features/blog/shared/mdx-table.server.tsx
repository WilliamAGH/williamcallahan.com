/**
 * MDX Table Component
 *
 * A server-side component for rendering tables in MDX documents.
 *
 * @module components/ui/mdx-table.server
 */

import { Children, type FC, type ReactNode } from "react";

import type { TableProps, TheadProps, TrProps, ThProps, TdProps } from "@/types";

/**
 * Extracts plain text from children without forcing Object stringification.
 * Returns null when children include non-text nodes so formatting stays safe.
 */
const getPlainTextContent = (children: ReactNode): string | null => {
  const normalizedChildren = Children.toArray(children);

  if (normalizedChildren.length === 0) {
    return null;
  }

  if (normalizedChildren.every(child => typeof child === "string" || typeof child === "number")) {
    return normalizedChildren.map(child => child.toString()).join("");
  }

  return null;
};

export const MDXTable: FC<TableProps> = ({ children, ...props }) => {
  return (
    <div className="my-8 overflow-hidden rounded-xl bg-white/50 dark:bg-gray-800/50 shadow-xl ring-1 ring-black/5 dark:ring-white/5">
      <div className="overflow-x-auto">
        <table {...props} className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
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

export const MDXTableHeader: FC<TheadProps> = ({ children, ...props }) => {
  return (
    <thead {...props}>
      <tr className="bg-gray-50/80 dark:bg-gray-800/80">{children}</tr>
    </thead>
  );
};

export const MDXTableRow: FC<TrProps> = ({ children, ...props }) => {
  return (
    <tr
      {...props}
      className="transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 last:border-0"
    >
      {children}
    </tr>
  );
};

export const MDXTableHeaderCell: FC<ThProps> = ({ children, ...props }) => {
  return (
    <th
      scope="col"
      {...props}
      className={`px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 ${props.className || ""}`.trim()}
    >
      {children}
    </th>
  );
};

export const MDXTableCell: FC<TdProps> = ({ children, ...props }) => {
  const plainTextContent = getPlainTextContent(children);
  const normalizedContent = plainTextContent?.trim() ?? "";

  const isNumeric = normalizedContent !== "" && /^[€$]?\d/.test(normalizedContent);
  const isNegative = isNumeric && normalizedContent.includes("-");
  const isPositive = isNumeric && normalizedContent.includes("+");

  return (
    <td
      {...props}
      className={`px-6 py-4 text-sm font-medium ${
        isNumeric
          ? `text-right tabular-nums tracking-tight ${
              isNegative
                ? "text-red-600 dark:text-red-400"
                : isPositive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-gray-900 dark:text-gray-100"
            }`
          : "text-left text-gray-600 dark:text-gray-300"
      } ${props.className || ""}`.trim()}
    >
      {isNumeric ? <span className="inline-block min-w-[140px]">{children}</span> : children}
    </td>
  );
};
