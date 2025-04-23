/**
 * Social Icons Component
 *
 * Displays social media icons with links to the author's profiles.
 */

"use client";

import Link from 'next/link';
// Remove individual icon imports as they come from socialLinks now
// import { GitHub } from './github-icon';
// import { LinkedIn } from './linkedin-icon';
// import { X } from './x-icon';
import { ErrorBoundary } from '../error-boundary.client';
import { IconWrapper } from '@/components/utils/icon-wrapper.client';
import { socialLinks } from './social-links'; // Import the links data
import type { SocialLink } from '@/types/social'; // Import the type
// Remove explicit Discord import - rely on socialLinks again
// import { Discord } from './discord-icon';

interface SocialIconsProps {
  className?: string;
}

/**
 * Social media icons with links
 * Each icon is wrapped in its own error boundary to prevent all icons
 * from failing if one has an issue
 */
export function SocialIcons({ className = '' }: SocialIconsProps) {
  // Common classes for icon buttons - Add transition and scale effect on hover
  const iconButtonClasses =
    "p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all duration-200 ease-in-out hover:scale-110 active:scale-100"; // Added transition, scale, active state

  // Remove the manual find for Discord
  // const discordLinkData = socialLinks.find(link => link.label === 'Discord');

  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      {/* Revert to mapping all links */}
      {socialLinks.map((link: SocialLink) => (
        <ErrorBoundary key={link.label} silent>
          <Link
            href={link.href}
            className={iconButtonClasses} // Apply updated classes
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label} // Add title for better accessibility/tooltip
          >
            {/* Use the icon from the link data */}
            <IconWrapper icon={link.icon} className="w-5 h-5" />
          </Link>
        </ErrorBoundary>
      ))}

      {/* Remove the manual Discord rendering */}
      {/* {discordLinkData && (...)} */}
    </div>
  );
}