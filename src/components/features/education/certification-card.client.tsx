/**
 * Certification Card Client Component
 * @module components/features/education/certification-card.client
 * @description
 * Client component that handles the display and interaction for certification entries.
 * Receives pre-fetched logo data from the server component.
 *
 * @example
 * ```tsx
 * <CertificationCardClient
 *   institution="AWS"
 *   name="Solutions Architect"
 *   logoData={{ src: "/api/logo?website=aws.amazon.com", source: null }}
 *   // ... other props
 * />
 * ```
 */

"use client";

import { ExternalLink as ExternalLinkIcon } from "lucide-react";

import { LogoImage } from "@/components/ui/logo-image.client";
import { cn } from "@/lib/utils";

import { ExternalLink } from "../../ui/external-link.client";

import type { JSX } from "react";

import type { CertificationCardClientProps } from "@/types/education";

/**
 * Certification Card Client Component
 * @param {CertificationCardClientProps} props - Component properties
 * @returns {JSX.Element} Rendered certification card with pre-fetched logo
 */
export function CertificationCardClient({
  certification,
  className,
}: CertificationCardClientProps): JSX.Element {
  const { name, institution, year, website, logoScale, logoData } = certification;

  const content = (
    <div className="p-6">
      <div className="flex items-start gap-5">
        <div className="w-12 h-12 relative flex-shrink-0 rounded overflow-hidden flex items-center justify-center">
          <span
            className="block w-full h-full"
            style={{ transform: logoScale ? `scale(${logoScale})` : undefined }}
          >
            <LogoImage
              src={logoData?.url}
              width={48}
              height={48}
              className="object-contain w-full h-full"
              alt={institution}
              needsInversion={logoData?.needsInversion}
            />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <h3 className="text-xl font-semibold">{institution}</h3>
              {website && (
                <span className="text-gray-400" aria-hidden="true">
                  <ExternalLinkIcon className="w-4 h-4" />
                </span>
              )}
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">{year}</span>
          </div>
          <div className="space-y-1">
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{name}</p>
          </div>
        </div>
      </div>
    </div>
  );

  if (website) {
    return (
      <ExternalLink
        href={website}
        title={`Visit ${institution}'s website`}
        className={cn(
          "block rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200",
          className,
        )}
        rawTitle
        showIcon={false}
      >
        {content}
      </ExternalLink>
    );
  }

  return (
    <div
      className={cn(
        "group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 transition-all duration-200",
        className,
      )}
    >
      {content}
    </div>
  );
}
