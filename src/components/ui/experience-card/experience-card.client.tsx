/**
 * @fileoverview Client-side experience card component for displaying professional experience entries.
 * Handles logo display, company information, role details, and external links with hover effects.
 * @version 1.0.0
 */

"use client";

import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import { ExternalLink } from "../external-link.client";
import { LogoImage } from "../logo-image.client";

import type { JSX } from "react";

import type { ExperienceCardExtendedProps } from "@/types";

/**
 * Client-side experience card component that displays professional experience information
 * with interactive elements like hover effects and external links.
 *
 * @component
 * @param {ExperienceCardExtendedProps} props - The experience data and logo information
 * @param {string} props.id - Unique identifier for the experience entry
 * @param {string} props.company - Company name
 * @param {string} props.period - Formatted time period string
 * @param {string} props.startDate - ISO date string for start date
 * @param {string} [props.endDate] - ISO date string for end date, undefined if current
 * @param {string} props.role - Job title or role description
 * @param {string} props.website - Company website URL
 * @param {string} [props.location] - Work location, optional
 * @param {LogoData} props.logoData - Logo image data
 * @returns {JSX.Element} Rendered experience card with hover effects and external links
 *
 * @example
 * ```tsx
 * <ExperienceCardClient
 *   id="company-123"
 *   company="Tech Corp"
 *   period="2020 - 2023"
 *   startDate="2020-01-01"
 *   endDate="2023-12-31"
 *   role="Senior Developer"
 *   website="https://techcorp.com"
 *   location="San Francisco, CA"
 *   logoData={{ url: "/logos/techcorp.png", source: "clearbit" }}
 * />
 * ```
 */
export function ExperienceCardClient({
  id,
  company,
  period,
  startDate,
  endDate,
  role,
  website,
  location,
  logoData,
}: ExperienceCardExtendedProps): JSX.Element {
  return (
    <div
      id={id}
      tabIndex={-1}
      className="group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 focus:outline-none"
    >
      <div className="p-6">
        <div className="flex items-start gap-5">
          <div className="w-12 h-12 relative flex-shrink-0">
            {website ? (
              <ExternalLink href={website} title={company} rawTitle={true} showIcon={false}>
                <LogoImage
                  src={logoData.url}
                  width={48}
                  height={48}
                  className="object-contain rounded-lg"
                  alt={company}
                  needsInversion={logoData.needsInversion}
                />
              </ExternalLink>
            ) : (
              <LogoImage
                src={logoData.url}
                width={48}
                height={48}
                className="object-contain rounded-lg"
                alt={company}
                needsInversion={logoData.needsInversion}
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-2">
              <span className="text-xl font-semibold min-w-0">
                {website ? (
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title={`Visit ${company}'s website`}
                  >
                    {company}
                    <ExternalLinkIcon
                      className="w-4 h-4 inline-block align-middle ml-1.5 text-gray-400"
                      aria-hidden="true"
                    />
                  </a>
                ) : (
                  company
                )}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
                <time dateTime={startDate}>{period.split(" - ")[0]}</time>
                {" - "}
                <time dateTime={endDate || "Present"}>{period.split(" - ")[1]}</time>
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{role}</p>
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
