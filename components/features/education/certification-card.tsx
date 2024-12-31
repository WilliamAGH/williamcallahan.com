/**
 * Certification Card Component
 * Displays professional certification information with logo and details
 */

import { ExternalLink } from 'lucide-react';
import { LogoImage } from '../../../components/ui';
import type { Certification } from '../../../types/education';

export function CertificationCard({ 
  institution, 
  name,
  year,
  logo,
  website
}: Certification) {
  return (
    <div className="group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200">
      <div className="p-6">
        <div className="flex items-start gap-6">
          <div className="w-16 h-16 relative flex-shrink-0">
            <LogoImage
              company={institution}
              logoUrl={logo}
              width={64}
              height={64}
              className="object-contain rounded-lg"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold">{institution}</h3>
                {website && (
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="View certification details"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {year}
              </span>
            </div>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              {name}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
