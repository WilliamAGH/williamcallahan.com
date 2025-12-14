/**
 * Server component that pre-renders investment cards
 * Uses ServerCache for logo caching and processing
 */

import { GlobalWindowRegistryProvider } from "@/lib/context/global-window-registry-context.client";
import { InvestmentsClient } from "./investments.client";
import { resolveInvestmentCardData } from "./investment-card.server";

import type { JSX } from "react";

import type { InvestmentsProps } from "@/types";

const LOGO_RESOLUTION_BATCH_SIZE = 6;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];

  const results: R[] = [];
  for (let index = 0; index < items.length; index += limit) {
    const slice = items.slice(index, index + limit);
    const mapped = await Promise.all(slice.map(mapper));
    results.push(...mapped);
  }
  return results;
}

/**
 * Server-side React component that pre-renders investment cards and provides them to the client component within a global context.
 *
 * @param investments - Optional array of investment objects to display.
 * @returns A JSX element containing the client-side investments component wrapped in a global window registry provider.
 */
export async function Investments({ investments = [] }: InvestmentsProps): Promise<JSX.Element> {
  const resolvedInvestments = await mapWithConcurrency(
    investments,
    LOGO_RESOLUTION_BATCH_SIZE,
    resolveInvestmentCardData,
  );

  return (
    <GlobalWindowRegistryProvider>
      <InvestmentsClient investments={resolvedInvestments} />
    </GlobalWindowRegistryProvider>
  );
}
