/**
 * Server component that pre-renders investment cards
 * Uses batched logo resolution to keep server render work bounded
 */

import { GlobalWindowRegistryProvider } from "@/lib/context/global-window-registry-context.client";
import { InvestmentsClient } from "./investments.client";
import { resolveInvestmentCardData } from "./investment-card.server";
import { mapWithBoundedConcurrency } from "@/lib/utils/async-lock";

import type { JSX } from "react";

import type { InvestmentsProps } from "@/types/features/investments";

const LOGO_RESOLUTION_BATCH_SIZE = 6;

/**
 * Server-side React component that pre-renders investment cards and provides them to the client component within a global context.
 *
 * @param investments - Optional array of investment objects to display.
 * @returns A JSX element containing the client-side investments component wrapped in a global window registry provider.
 */
export async function Investments({
  investments = [],
}: Readonly<InvestmentsProps>): Promise<JSX.Element> {
  const resolvedInvestments = await mapWithBoundedConcurrency(
    investments,
    LOGO_RESOLUTION_BATCH_SIZE,
    (investment) => resolveInvestmentCardData(investment),
  );

  return (
    <GlobalWindowRegistryProvider>
      <InvestmentsClient investments={resolvedInvestments} />
    </GlobalWindowRegistryProvider>
  );
}
