import { LucideIcon } from 'lucide-react';
import type { SocialIconProps } from '@/types/social';

export const IndividualIcon = ({ href, label, icon: Icon }: SocialIconProps) => {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
      aria-label={label}
    >
      <Icon className="w-5 h-5" />
    </a>
  );
};