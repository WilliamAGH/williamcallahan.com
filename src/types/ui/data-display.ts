/**
 * Data Display Component Types
 *
 * SCOPE: Types for components that display data, such as financial metrics.
 */

export interface FinancialMetricsProps {
  /** Holding return percentage */
  holding_return?: number;
}

/**
 * Generic metric item for display within a metrics group.
 * Designed for MDX-driven articles where values are often preformatted strings.
 */
export interface MetricItem {
  /** Human-readable label for the metric (e.g., "Cumulative return") */
  label: string;
  /** Preformatted value to display (e.g., "€45,341.58" or "+10.59%") */
  value: string | number;
  /** Optional positive indicator for color-coding */
  isPositive?: boolean;
  /** Optional negative indicator for color-coding */
  isNegative?: boolean;
}

/**
 * Props for rendering a group of labeled metrics, used by MDX `<MetricsGroup />`.
 */
export interface MetricsGroupProps {
  /** Title of the group, e.g., the fund name */
  title: string;
  /** Optional as-of date or context string */
  date?: string;
  /** List of metric items to render */
  metrics: MetricItem[];
}
