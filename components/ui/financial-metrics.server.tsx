/**
 * Financial Metrics Component
 * @module components/ui/financial-metrics
 * @description
 * Displays investment financial metrics with color-coded return values.
 */

import { formatPercentage } from '../../lib/utils';
import { cn } from '../../lib/utils';

import type { JSX } from "react";

interface FinancialMetricsProps {
  /** Holding return percentage */
  holding_return?: number;
}

/**
 * Financial Metrics Component
 * @component
 * @param {FinancialMetricsProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
export default function FinancialMetrics({
  holding_return
}: FinancialMetricsProps): JSX.Element {
  if (holding_return === undefined) return <div />;

  // Convert decimal to percentage and handle edge cases
  const returnValue = holding_return * 100;
  const returnColor = Math.abs(returnValue) < 0.01
    ? 'text-gray-600 dark:text-gray-400'  // For values very close to 0
    : returnValue > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : returnValue < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-600 dark:text-gray-400';

  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex flex-col">
        <span className="text-sm text-gray-500 dark:text-gray-400">Return</span>
        <span className={cn("font-medium", returnColor)}>
          {formatPercentage(returnValue)}
        </span>
      </div>
    </div>
  );
}
