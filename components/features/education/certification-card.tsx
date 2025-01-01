/**
 * Certification Card Component
 * Displays professional certification information with logo and details
 *
 * @module components/features/education/certification-card
 */

import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { LogoImage } from '../../../components/ui';
import { ExternalLink } from '../../../components/ui/external-link';
import type { Certification } from '../../../types/education';

/**
 * Props for the CertificationCard component
 */
interface CertificationCardProps extends Certification {}

/**
 * A component that displays certification information
 * including logo, name, and year with external linking capabilities
 *
 * @component
 * @example
 * <CertificationCard
 *   institution="CFA Institute"
 *   name="Chartered Financial Analyst"
 *   year="2023"
 *   website="https://cfainstitute.org"
 *   logo="/images/cfa-logo.svg"
 * />
 */
export function CertificationCard({
  institution,
  name,
  year,
  logo,
  website,
  location
}: CertificationCardProps): JSX.Element {
  return (
    <div className="group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200">
      <div className="p-6">
        <div className="flex items-start gap-6">
          <div className="w-16 h-16 relative flex-shrink-0">
            <ExternalLink
              href={website}
              title={institution}
              rawTitle={true}
              showIcon={false}
            >
              <LogoImage
                company={institution}
                logoUrl={logo}
                website={website}
                width={64}
                height={64}
                className="object-contain rounded-lg"
                alt={institution}
              />
            </ExternalLink>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <ExternalLink
                  href={website}
                  title={`Visit ${institution}'s website`}
                  showIcon={false}
                  className="text-xl font-semibold hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {institution}
                </ExternalLink>
                {website && (
                  <ExternalLink
                    href={website}
                    title={`Visit ${institution}'s website`}
                    showIcon={false}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <ExternalLinkIcon className="w-4 h-4" />
                  </ExternalLink>
                )}
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {year}
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                {name}
              </p>
              {location && (
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {location}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
