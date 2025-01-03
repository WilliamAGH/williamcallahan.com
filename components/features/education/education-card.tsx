/**
 * Education Card Component
 * Displays educational institution information with logo and details
 *
 * @module components/features/education/education-card
 */

import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { LogoImage } from '../../../components/ui';
import { ExternalLink } from '../../../components/ui/external-link';
import type { Education } from '../../../types/education';

/**
 * Props for the EducationCard component
 */
interface EducationCardProps extends Education {}

/**
 * A component that displays an educational institution's information
 * including logo, degree, and year with external linking capabilities
 *
 * @component
 * @example
 * <EducationCard
 *   institution="MIT"
 *   degree="Master of Science"
 *   year="2023"
 *   website="https://mit.edu"
 * />
 */
export function EducationCard({
  institution,
  degree,
  year,
  website,
  location,
  logo
}: EducationCardProps): JSX.Element {
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
                url={logo || `/api/logo?website=${encodeURIComponent(website)}`}
                width={64}
                height={64}
                className="object-contain w-full h-full rounded-lg"
                alt={institution}
                enableInversion={true}
                showPlaceholder={true}
                website={website}
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
                {degree}
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
