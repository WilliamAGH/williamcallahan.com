/**
 * Investments Server Component
 * @module components/features/investments/investments.server
 * @description
 * Server component that handles pre-rendering investment cards.
 * Uses ServerCache for efficient logo caching and processing.
 */

import { InvestmentCardServer } from './index';
import { InvestmentsClient } from './investments.client';
import type { Investment } from '../../../types/investment';

/**
 * Props for the Investments component
 */
interface InvestmentsProps {
  /** List of investments to display */
  investments: Investment[];
}

/**
 * Investments Server Component
 * @param {InvestmentsProps} props - Component properties
 * @returns {Promise<JSX.Element>} Pre-rendered investments section with server-fetched logos
 */
// Force static generation
export const dynamic = 'force-static';

export async function Investments({ investments = [] }: InvestmentsProps): Promise<JSX.Element> {
  // Pre-render each investment card on the server
  const investmentsWithCards = await Promise.all(
    investments.map(async (investment) => ({
      ...investment,
      card: await InvestmentCardServer(investment)
    }))
  );

  return <InvestmentsClient investments={investmentsWithCards} />;
}
