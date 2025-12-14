/**
 * Table Component Types
 *
 * SCOPE: Types for responsive and MDX table components.
 */
import type { ReactNode } from "react";

// Responsive Table Component Types
export type TableCellValue = string | number | ReactNode;
export type TableRowData = Record<string, TableCellValue>;
export type TableColumnDef = {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  align?: "left" | "center" | "right";
};

export interface ResponsiveTableProps {
  /** Table data */
  data: TableRowData[];
  /** Column definitions */
  columns: TableColumnDef[];
  /** Whether table is sortable */
  sortable?: boolean;
  /** Custom CSS classes */
  className?: string;
  /** Empty state message */
  emptyMessage?: string;
}

// Helper types for parsing
export type TableCell = ReactNode;
export type TableRow = TableCell[];
export type TableData = {
  headers: TableCell[];
  rows: TableRow[];
};

export interface ResponsiveTableContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Child components to wrap - expects children of a <table> element */
  children: ReactNode;
}

// MDX Table Component Types
export type TableProps = React.DetailedHTMLProps<React.TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>;
export type TheadProps = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLTableSectionElement>,
  HTMLTableSectionElement
>;
export type TrProps = React.DetailedHTMLProps<React.HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement>;
export type ThProps = React.DetailedHTMLProps<
  React.ThHTMLAttributes<HTMLTableHeaderCellElement>,
  HTMLTableHeaderCellElement
>;
export type TdProps = React.DetailedHTMLProps<
  React.TdHTMLAttributes<HTMLTableDataCellElement>,
  HTMLTableDataCellElement
>;
