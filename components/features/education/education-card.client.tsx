"use client";;
/**
 * Education Card Client Component
 * @module components/features/education/education-card.client
 * @description
 * Client component that handles the display and interaction for education entries.
 * Receives pre-fetched logo data from the server component.
 *
 * @example
 * ```tsx
 * <EducationCardClient
 *   institution="UC Berkeley"
 *   degree="Computer Science"
 *   logoData={{ src: "/api/logo?website=berkeley.edu", source: null }}
 *   // ... other props
 * />
 * ```
 */

import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { LogoImage } from '../../../components/ui';
import { ExternalLink } from '../../ui/external-link.client';
import type { Education } from '../../../types/education';

import type { JSX } from "react";

/**
 * Logo data structure
 * @interface
 */
interface LogoData {
  /** Source URL of the logo image */
  /** Source of the logo (e.g., 'google', 'clearbit', etc.) */
  src: string;
  source: string | null;
}

/**
 * Props for the Education Card Client Component
 * @interface
 * @extends {Education}
 */
interface EducationCardClientProps extends Education {
  /** Pre-fetched logo data from server */
  logoData: LogoData;
  logoScale?: number;
}

/**
 * Education Card Client Component
 * @param {EducationCardClientProps} props - Component properties
 * @returns {JSX.Element} Rendered education card with pre-fetched logo
 */
export function EducationCardClient({
  institution,
  degree,
  year,
  website,
  location,
  logoData,
  logoScale
}: EducationCardClientProps): JSX.Element {
  return (
    <div className="group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200">
      <div className="p-6">
        <div className="flex items-start gap-5">
          <div className="w-12 h-12 relative flex-shrink-0 rounded overflow-hidden flex items-center justify-center">
            <ExternalLink
              href={website}
              title={institution}
              rawTitle={true}
              showIcon={false}
              className="block w-full h-full"
            >
              <span
                className="block w-full h-full"
                style={{ transform: logoScale ? `scale(${logoScale})` : undefined }}
              >
                <LogoImage
                  src={logoData.src}
                  width={48}
                  height={48}
                  className="object-contain w-full h-full"
                  alt={institution}
                  // Removed invalid props: enableInversion, showPlaceholder
                />
              </span>
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
