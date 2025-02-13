"use client";

import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { LogoImage } from '../logoImage';
import { ExternalLink } from '../externalLink';
import type { Experience } from '../../../types/experience';
import { toISO, formatDisplay, formatYearDisplay } from '../../../lib/dateTime';

interface LogoData {
  url: string;
  source: string | null;
}

interface ExperienceCardClientProps extends Experience {
  logoData: LogoData;
}

export function ExperienceCardClient({
  id,
  company,
  startDate,
  endDate,
  role,
  website,
  location,
  logoData
}: ExperienceCardClientProps): JSX.Element {
  return (
    <div
      id={id}
      className="group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200"
    >
      <div className="p-6">
        <div className="flex items-start gap-6">
          <div className="w-16 h-16 relative flex-shrink-0">
            <ExternalLink
              href={website}
              title={company}
              rawTitle={true}
              showIcon={false}
            >
              <LogoImage
                url={logoData.url}
                width={64}
                height={64}
                className="object-contain rounded-lg"
                alt={company}
                enableInversion={false}
                showPlaceholder={true}
              />
            </ExternalLink>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="flex items-center gap-1 min-w-0">
                <ExternalLink
                  href={website}
                  title={`Visit ${company}'s website`}
                  showIcon={false}
                  className="text-xl font-semibold hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {company}
                </ExternalLink>
                {website && (
                  <ExternalLink
                    href={website}
                    title={`Visit ${company}'s website`}
                    showIcon={false}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <ExternalLinkIcon className="w-4 h-4" />
                  </ExternalLink>
                )}
              </div>
              <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                <time dateTime={toISO(startDate)}>{formatDisplay(startDate, 'year')}</time>
                {' - '}
                <time dateTime={endDate ? toISO(endDate) : undefined}>
                  {endDate ? formatDisplay(endDate, 'year') : 'Present'}
                </time>
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                {role}
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
