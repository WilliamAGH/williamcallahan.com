/**
 * Server component that pre-renders investment cards
 * Uses ServerCache for logo caching and processing
 */

import { GlobalWindowRegistryProvider } from "@/lib/context/global-window-registry-context.client";
import { InvestmentCardServer } from "./index";
import { InvestmentsClient } from "./investments.client";

import type { JSX } from "react";

import type { InvestmentsProps } from "@/types";

/**
 * Server-side React component that pre-renders investment cards and provides them to the client component within a global context.
 *
 * @param investments - Optional array of investment objects to display.
 * @returns A JSX element containing the client-side investments component wrapped in a global window registry provider.
 */
export async function Investments({ investments = [] }: InvestmentsProps): Promise<JSX.Element> {
  const investmentsWithCards = await Promise.all(
    investments.map(async (investment) => ({
      ...investment,
      card: await InvestmentCardServer(investment),
    })),
  );

  return (
    <GlobalWindowRegistryProvider>
      <InvestmentsClient investments={investmentsWithCards} />
    </GlobalWindowRegistryProvider>
  );
}
