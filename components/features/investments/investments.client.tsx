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
import { ExternalLink } from '../../ui/externalLink';
import type { Investment } from '../../../types/investment';
import Link from 'next/link';

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
          <div className="prose dark:prose-invert max-w-none mb-8">
            <p>
              Below is the data (periodically updated) on all of my private startup investments to-date. The idea is to be transparent about all of them: no{' '}
              <ExternalLink
                href="https://corporatefinanceinstitute.com/resources/accounting/window-dressing/#:~:text=Window%20dressing%20is%20a%20short,next%20reporting%20period's%20bottom%20line."
              >
                window dressing
              </ExternalLink>{' '}
              and no{' '}
              <ExternalLink
                href="https://en.wikipedia.org/wiki/Survivorship_bias"
              >
                survivorship bias
              </ExternalLink>
              . I&apos;ve sought in good faith to represent them all here.
            </p>
            <p>
              The vast majority of these investments were passive / on the sidelines. That means I wasn&apos;t a large or meaningful part of their fundraising round, just allowed to participate with a smaller amount (typically $5,000 to $25,000).
            </p>
            <p>
              The longer-term goal of this dataset is to shed light on early stage investing to make it better for everyone involved. To bring some of the rigor of public markets with the{' '}
              <ExternalLink
                href="http://archives.cpajournal.com/2003/1203/nv/nv2.htm"
              >
                &quot;disinfectant of sunlight&quot;
              </ExternalLink>
              .
            </p>
            <p>
              I think there are a lot of lessons available for founders and investors alike, and hope to increase the available data over time.{' '}
              <Link href="/" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
                Reach out
              </Link>{' '}
              if you&apos;d like to see me add any data points or background!
            </p>
            <details className="mt-8 group">
              <summary className="text-lg font-semibold mb-4 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
                A quick note on returns{' '}
                <span className="text-sm text-gray-500 dark:text-gray-400 group-open:hidden inline-block ml-1">(click to expand)</span>
                <span className="text-sm text-gray-500 dark:text-gray-400 hidden group-open:inline-block ml-1">(click to collapse)</span>
              </summary>
              <ol className="list-decimal list-outside space-y-4 ml-4 mt-4">
                <li className="space-y-2">
                  <p className="italic">Return calculations require assigning at least two valuations: when you invest and at some later point, either when you exit or at an arbitrary point in time. Exits are easy to calculate (the price is set by someone else, just as the investment had), but the majority of current investments otherwise must be valued arbitrarily by some estimate of current value.</p>
                  <p className="italic">Currently I am using the simplest methodology available: the last fundraising round valuation. That means if they haven&apos;t raised more money since, the valuation is statistically more likely to be overstated than understated. Remember, this is not an endorsement or investment advice, nor an offer for any securities.</p>
                </li>
                <li className="space-y-2">
                  <p className="italic">A lot of the returns show small declines or near complete losses but not total losses. These should probably stand out as peculiar, but there&apos;s a good reason for both: fees/transaction costs.</p>
                  <p className="italic">The vast majority of deals have some allocation of transaction costs for legal and related expenses incurred in the transaction. That means less than 100% of the principal ends up getting invested in the company. Therefore it immediately has a negative return equal to the amount of transaction expense incurred. And in the event of a total loss without a distribution, it has been accounted for as a total loss of the principal invested excluding the transaction costs.</p>
                </li>
              </ol>
            </details>
          </div>
          <div className="space-y-6">
            {investments.map((investment) => (
              <div key={`${investment.id}-${investment.invested_year}`}>{investment.card}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
