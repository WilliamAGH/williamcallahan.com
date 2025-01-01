/**
 * ExperienceCard Component
 * Displays professional experience information with logo and details
 *
 * @module components/ui/experience-card
 */

"use client";

import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { LogoImage } from '../logo-image';
import { ExternalLink } from '../external-link';
import type { Experience } from '../../../types/experience';

/**
 * Props for the ExperienceCard component
 */
interface ExperienceCardProps extends Experience {}

/**
 * A component that displays professional experience information
 * including company logo, role, and duration with external linking capabilities
 *
 * @component
 * @example
 * <ExperienceCard
 *   company="Google"
 *   role="Software Engineer"
 *   period="2020 - Present"
 *   website="https://google.com"
 *   logo="/images/google-logo.svg"
 * />
 */
export function ExperienceCard({
  id,
  company,
  period,
  role,
  logo,
  website
}: ExperienceCardProps): JSX.Element {
  return (
    <div
      id={id}
      className="group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200"
    >
      <div className="p-6">
        <div className="flex items-start gap-6">
          <div className="w-16 h-16 relative flex-shrink-0">
            <LogoImage
              company={company}
              logoUrl={logo}
              website={website}
              width={64}
              height={64}
              className="object-contain rounded-lg"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <ExternalLink
                  href={website}
                  title={`Visit ${company}'s website`}
                  showIcon={false}
                  className="text-xl font-semibold hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {company}
                </ExternalLink>
                {website && (
                  <ExternalLinkIcon
                    className="w-4 h-4 text-gray-400"
                    aria-label="Opens in new tab"
                  />
                )}
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {period}
              </span>
            </div>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              {role}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
