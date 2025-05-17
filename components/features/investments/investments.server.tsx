/**
 * Server component that pre-renders investment cards
 * Uses ServerCache for logo caching and processing
 */

import { InvestmentCardServer } from './index';
import { InvestmentsClient } from './investments.client';
import type { Investment } from '../../../types/investment';
import { GlobalWindowRegistryProvider } from '@/lib/context/global-window-registry-context.client';

/**
 * Props for the Investments component
 */
interface InvestmentsProps {
  /** List of investments to display */
  investments: Investment[];
}

export async function Investments({ investments = [] }: InvestmentsProps): Promise<JSX.Element> {
  const investmentsWithCards = await Promise.all(
    investments.map(async (investment) => ({
      ...investment,
      card: await InvestmentCardServer(investment)
    }))
  );

  return (
    <GlobalWindowRegistryProvider>
      <InvestmentsClient investments={investmentsWithCards} />
    </GlobalWindowRegistryProvider>
  );
}
