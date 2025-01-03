/**
 * Investment Card Component
 * @module components/features/investments/investment-card
 * @description
 * Displays investment information with logo, metrics, and details
 */

import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { LogoImage } from '../../../components/ui';
import { ExternalLink } from '../../../components/ui/external-link';
import FinancialMetrics from '../../../components/ui/financial-metrics';
import type { Investment } from '../../../types/investment';

/**
 * Props for the InvestmentCard component
 */
interface InvestmentCardProps {
  /** Investment data */
  investment: Investment;
}

/**
 * A component that displays investment information
 * including logo, company name, and financial metrics
 *
 * @component
 * @example
 * <InvestmentCard
 *   investment={{
 *     name: "Example Co",
 *     website: "https://example.com",
 *     metrics: { multiple: 2.5, holding_return: 150 }
 *   }}
 * />
 */
export function InvestmentCard({ investment }: InvestmentCardProps): JSX.Element {
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
      <div className="p-6">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-12 h-12 relative flex-shrink-0">
                <ExternalLink
                  href={website}
                  title={name}
                  rawTitle={true}
                  showIcon={false}
                >
                  <LogoImage
                    url={`/api/logo?website=${encodeURIComponent(website || '')}`}
                    width={48}
                    height={48}
                    className="object-contain w-full h-full"
                    alt={name}
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
            <div className="flex flex-col items-end text-sm space-y-1">
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
          <div className="grid grid-cols-3 gap-4">
            {details && details
              .filter(detail => !['Investment Type', 'Entry Stage', 'Sector'].includes(detail.label))
              .map((detail, index) => (
                <div key={index}>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{detail.label}</div>
                  <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">{detail.value}</div>
                </div>
              ))}
            <div>
              <FinancialMetrics holding_return={holding_return} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
