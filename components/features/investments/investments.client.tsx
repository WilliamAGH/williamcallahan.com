"use client";

/**
 * Investments Client Component
 * @module components/features/investments/investments.client
 * @description
 * Client component that handles the display and interaction for the investments section.
 * Receives pre-rendered investment cards from the server component.
 *
 * @example
 * ```tsx
 * <InvestmentsClient investments={preRenderedInvestments} />
 * ```
 */

import { WindowControls } from '../../../components/ui/navigation/window-controls';
import type { Investment } from '../../../types/investment';

/**
 * Extended investment type with pre-rendered card
 * @interface
 * @extends {Investment}
 */
interface InvestmentWithCard extends Investment {
  /** Pre-rendered JSX element for the investment card */
  card: JSX.Element;
}

/**
 * Props for the InvestmentsClient component
 * @interface
 */
interface InvestmentsClientProps {
  /** List of pre-rendered investment cards */
  investments: InvestmentWithCard[];
}

/**
 * Investments Client Component
 * @param {InvestmentsClientProps} props - Component properties
 * @returns {JSX.Element} Rendered investments section with pre-rendered cards
 *
 * @remarks
 * This component is responsible for:
 * - Displaying the investments section header
 * - Rendering pre-rendered investment cards
 * - Handling empty state
 */
export function InvestmentsClient({ investments = [] }: InvestmentsClientProps): JSX.Element {
  if (!investments?.length) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-400 py-8">
        No investments to display
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto mt-8">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
          <div className="flex items-center">
            <WindowControls />
            <h1 className="text-xl font-mono ml-4">~/investments</h1>
          </div>
        </div>

        <div className="p-6">
          <div className="space-y-6">
            {investments.map((investment) => (
              <div key={investment.id}>{investment.card}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
