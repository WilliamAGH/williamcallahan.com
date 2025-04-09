"use client";

/**
 * Investment Card Client Component
 * @module components/features/investments/investment-card.client
 * @description
 * Client component that handles the display and interaction for investment entries.
 * Receives pre-fetched logo data from the server component.
 *
 * @example
 * ```tsx
 * <InvestmentCardClient
 *   {...investment}
 *   logoData={{ url: '/api/logo/123', source: 'google' }}
 *   isDarkTheme={true}
 * />
 * ```
 */

import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { LogoImage } from '../../../components/ui';
import { ExternalLink } from '../../ui/external-link.client';
import FinancialMetrics from '../../ui/financial-metrics.server';
import type { Investment } from '../../../types/investment';
import type { LogoData } from '../../../types/logo';

/**
 * Props for the InvestmentCardClient component
 * @interface
 * @extends {Investment}
 */
interface InvestmentCardClientProps extends Investment {
  /** Pre-fetched logo data from server */
  logoData: LogoData;
  /** Whether dark theme is active */
  isDarkTheme?: boolean;
}

/**
 * Investment Card Client Component
 * @param {InvestmentCardClientProps} props - Component properties
 * @returns {JSX.Element} Rendered investment card with pre-fetched logo
 *
 * @remarks
 * This component is responsible for:
 * - Displaying company information
 * - Rendering pre-fetched logos
 * - Handling external links
 * - Displaying financial metrics
 * - Theme-aware rendering
 */
export function InvestmentCardClient({ logoData, isDarkTheme, ...investment }: InvestmentCardClientProps): JSX.Element {
  const {
    name,
    website,
    description,
    location,
    status,
    metrics,
    multiple,
    holding_return,
    category,
    accelerator,
    details,
    founded_year,
    invested_year,
    acquired_year,
    shutdown_year,
    stage
  } = investment;

  // Combine metrics into one object
  const allMetrics = {
    ...(metrics || {}),
    multiple,
    holding_return
  };

  // Get accelerator display name
  const acceleratorName = accelerator?.program === 'techstars' ? 'Techstars' :
                         accelerator?.program === 'ycombinator' ? 'Y Combinator' :
                         null;

  return (
    <div className="group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-5 sm:gap-6">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-12 h-12 relative flex-shrink-0">
                <ExternalLink
                  href={website}
                  title={name}
                  rawTitle={true}
                  showIcon={false}
                >
                  <LogoImage
                    url={logoData.url}
                    width={48}
                    height={48}
                    className="object-contain"
                    alt={name}
                    website={website}
                    isDarkTheme={isDarkTheme}
                  />
                </ExternalLink>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <ExternalLink
                    href={website}
                    title={`Visit ${name}'s website`}
                    showIcon={false}
                    className="text-lg font-semibold hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {name}
                  </ExternalLink>
                  {website && (
                    <ExternalLink
                      href={website}
                      title={`Visit ${name}'s website`}
                      showIcon={false}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <ExternalLinkIcon className="w-4 h-4" />
                    </ExternalLink>
                  )}
                </div>
                {accelerator && (
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-cyan-500 dark:text-cyan-400">
                      {acceleratorName}
                    </span>
                    <span className="text-sm text-gray-400 dark:text-gray-500">•</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {accelerator.batch}
                    </span>
                    <span className="text-sm text-gray-400 dark:text-gray-500">•</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {accelerator.location}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end text-sm space-y-1 min-w-[140px] flex-shrink-0">
              {founded_year && <span className="text-gray-400 dark:text-gray-500">Founded {founded_year}</span>}
              {invested_year && <span className="text-gray-500 dark:text-gray-400">Invested {invested_year}</span>}
              {acquired_year && <span className="text-gray-600 dark:text-gray-300">Acquired {acquired_year}</span>}
              {shutdown_year && <span className="text-gray-700 dark:text-gray-200">Closed {shutdown_year}</span>}
            </div>
          </div>

          {/* Description */}
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
            {description}
          </p>

          {/* Status Badges */}
          <div className="flex flex-wrap gap-2">
            {status && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                {status}
              </span>
            )}
            {stage && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                {stage}
              </span>
            )}
            {category && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                {category}
              </span>
            )}
          </div>

          {/* Investment Details and Metrics */}
          <div className="flex flex-col space-y-6">
            <div className="border rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 sm:p-4">
              <div className="grid grid-cols-3 gap-x-2 sm:gap-x-6">
                <div className="flex flex-col text-center">
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Round Size</div>
                  <div className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 font-medium whitespace-nowrap">${new Intl.NumberFormat().format(Number.parseInt(details?.find(d => d.label === 'Round Size')?.value.replace(/[^0-9]/g, '') || '0'))}</div>
                </div>
                <div className="flex flex-col text-center">
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Valuation</div>
                  <div className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 font-medium whitespace-nowrap">${new Intl.NumberFormat().format(Number.parseInt(details?.find(d => d.label === 'Valuation')?.value.replace(/[^0-9]/g, '') || '0'))}</div>
                </div>
                <div className="flex flex-col text-center">
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Return</div>
                  <div className={`text-xs sm:text-sm font-medium whitespace-nowrap ${holding_return >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {(holding_return >= 0 ? '+' : '') + (holding_return * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
