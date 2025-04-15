/**
 * Social Icons Component
 *
 * Displays social media icons with links to the author's profiles.
 */

"use client";

import Link from 'next/link';
import { GitHub } from './github-icon';
import { LinkedIn } from './linkedin-icon';
import { X } from './x-icon';
import { ErrorBoundary } from '../error-boundary.client';

interface SocialIconsProps {
  className?: string;
}

/**
 * Social media icons with links
 * Each icon is wrapped in its own error boundary to prevent all icons
 * from failing if one has an issue
 */
export function SocialIcons({ className = '' }: SocialIconsProps) {
  // Common classes for icon buttons
  const iconButtonClasses = "p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors";

  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <ErrorBoundary silent>
        <Link
          href="https://github.com/williamcallahan"
          className={iconButtonClasses}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub Profile"
        >
          <GitHub className="w-5 h-5" />
        </Link>
      </ErrorBoundary>

      <ErrorBoundary silent>
        <Link
          href="https://www.linkedin.com/in/william-callahan/"
          className={iconButtonClasses}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="LinkedIn Profile"
        >
          <LinkedIn className="w-5 h-5" />
        </Link>
      </ErrorBoundary>

      <ErrorBoundary silent>
        <Link
          href="https://twitter.com/williamcallahan"
          className={iconButtonClasses}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Twitter Profile"
        >
          <X className="w-5 h-5" />
        </Link>
      </ErrorBoundary>
    </div>
  );
}