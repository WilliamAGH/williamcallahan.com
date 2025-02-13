/**
 * Investments Server Component
 * @module components/features/investments/investments.server
 * @description
 * Server component that handles pre-rendering investment cards.
 * Uses ServerCache for efficient logo caching and processing.
 *
 * IMPORTANT: To avoid circular dependencies:
 * - Import server components directly from their source files
 * - Do not import through the feature's barrel file (index.ts)
 *
 * @see {@link "components/features/investments/investment-card.server.tsx"} - Direct import source
 * @see {@link "docs/development/best-practices.md"} - Dependency management guidelines
 */

import { InvestmentCard as InvestmentCardServer } from './investment-card.server';
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
// Enable dynamic rendering to allow API calls during server-side rendering
export const dynamic = 'force-dynamic';

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
