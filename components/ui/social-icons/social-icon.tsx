/**
 * Social Icon Component
 *
 * Renders a social media icon with link and hover effects.
 */

import type { SocialIconProps } from '@/types/social';

export function SocialIcon({ href, label, icon: Icon }: SocialIconProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
      aria-label={label}
      title={label}
    >
      <Icon className="w-5 h-5" />
    </a>
  );
}
