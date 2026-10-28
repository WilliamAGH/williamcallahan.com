/**
 * Server component that pre-renders investment cards
 * Uses batched logo resolution to keep server render work bounded
 */

import { InvestmentsClient } from "./investments.client";
import { resolveInvestmentCardData } from "./investment-card.server";
import { mapWithBoundedConcurrency } from "@/lib/utils/async-lock";

import type { JSX } from "react";

import type { InvestmentsProps } from "@/types/features/investments";

const LOGO_RESOLUTION_BATCH_SIZE = 6;

/**
 * Resolves investment card data for the client window, which uses the root layout's window registry.
 *
 * @param investments - Optional array of investment objects to display.
 * @returns The client-side investments window.
 */
export async function Investments({
  investments,
}: Readonly<InvestmentsProps>): Promise<JSX.Element> {
  const resolvedInvestments = await mapWithBoundedConcurrency(
    investments,
    LOGO_RESOLUTION_BATCH_SIZE,
    (investment) => resolveInvestmentCardData(investment),
  );

  return <InvestmentsClient investments={resolvedInvestments} />;
}
