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

"use client";

import { ExternalLink as ExternalLinkIcon, AlertCircle } from "lucide-react";

import { LogoImage } from "@/components/ui/logo-image.client";
import { cn } from "@/lib/utils";

import { ExternalLink } from "../../ui/external-link.client";

import type { JSX } from "react";

import type { EducationCardClientProps } from "@/types/education";

/**
 * Education Card Client Component
 * @param {EducationCardClientProps} props - Component properties
 * @returns {JSX.Element} Rendered education card with pre-fetched logo
 */
export function EducationCardClient({ education, className }: EducationCardClientProps): JSX.Element {
  const { degree, institution, year, website, location, logoScale, logoData } = education;
  const error: string | undefined = "error" in education ? (education as { error?: string }).error : undefined;

  const logoSrc = logoData?.url;

  return (
    <div
      className={cn(
        "group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200",
        className,
      )}
    >
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
                className="block w-full h-full relative"
                style={{ transform: logoScale ? `scale(${logoScale})` : undefined }}
              >
                <LogoImage
                  src={logoSrc}
                  width={48}
                  height={48}
                  className="object-contain w-full h-full"
                  alt={institution}
                />
                {error && (
                  <div
                    className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 dark:bg-yellow-600 rounded-full flex items-center justify-center"
                    title={error}
                  >
                    <AlertCircle className="w-3 h-3 text-white" />
                  </div>
                )}
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
              <span className="text-sm text-gray-500 dark:text-gray-400">{year}</span>
            </div>
            <div className="space-y-1">
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{degree}</p>
              {location && <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{location}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
