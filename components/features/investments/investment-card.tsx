/**
 * Investment Card Component
 * Displays investment information with logo, status, and details
 */

import { ExternalLink } from 'lucide-react';
import { AcceleratorBadge, LogoImage } from '../../../components/ui';
import type { Investment } from '../../../types/investment';

interface InvestmentCardProps {
  /** The investment data to display */
  investment: Investment;
}

export function InvestmentCard({ investment }: InvestmentCardProps) {
  const statusColors = {
    Active: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    Exited: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    Inactive: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
  };

  return (
    <div
      id={investment.id}
      className="group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200"
    >
      <div className="p-6">
        <div className="flex items-start gap-6">
          <div className="w-16 h-16 relative flex-shrink-0">
            <LogoImage
              company={investment.name}
              logoUrl={investment.logo}
              website={investment.website}
              width={64}
              height={64}
              className="object-contain rounded-lg"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold">{investment.name}</h3>
                {investment.website && (
                  <a
                    href={investment.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {investment.year}
              </span>
            </div>
            {investment.accelerator && (
              <div className="mb-3 max-w-full overflow-hidden">
                <AcceleratorBadge accelerator={investment.accelerator} />
              </div>
            )}
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {investment.description}
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className={`px-2 py-1 text-xs rounded-full ${statusColors[investment.status]}`}>
                {investment.status}
              </span>
              <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {investment.type}
              </span>
              <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {investment.stage}
              </span>
            </div>
            {investment.details && (
              <div className="grid grid-cols-2 gap-4">
                {investment.details.map((detail) => (
                  <div key={`${investment.id}-${detail.label}`}>
                    <dt className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {detail.label}
                    </dt>
                    <dd className="text-sm text-gray-700 dark:text-gray-200">
                      {detail.value}
                    </dd>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
