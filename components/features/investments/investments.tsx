/**
 * Investments Component
 * @module components/features/investments
 * @description
 * Displays a list of investments with filtering and sorting capabilities
 */

import { InvestmentCard } from './investment-card';
import { WindowControls } from '../../../components/ui/navigation/window-controls';
import type { Investment } from '../../../types/investment';

/**
 * Props for the Investments component
 */
interface InvestmentsProps {
  /** List of investments to display */
  investments: Investment[];
}

/**
 * A component that displays a list of investments
 * with filtering and sorting capabilities
 *
 * @component
 * @example
 * <Investments investments={investmentsList} />
 */
export function Investments({ investments = [] }: InvestmentsProps): JSX.Element {
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
              <InvestmentCard
                key={investment.id}
                investment={investment}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
