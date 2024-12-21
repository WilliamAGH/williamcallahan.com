/**
 * Social Icon Component
 * 
 * Individual social media link with icon.
 * Handles hover states and accessibility attributes.
 */

import type { SocialIconProps } from '@/types/social';

export function SocialIcon({ 
  href, 
  label, 
  icon: Icon 
}: Readonly<SocialIconProps>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
      aria-label={label}
    >
      <Icon 
        className="w-5 h-5" 
        aria-hidden="true"
        focusable="false"
      />
    </a>
  );
}