/**
 * Background Info Component
 * @module components/ui/backgroundInfo
 * @description
 * Displays a stylized background information box in blog posts.
 * Used to highlight contextual information that's supplementary to the main content.
 */

'use client';

import { ReactNode } from 'react';
import { InfoIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface BackgroundInfoProps {
  /** The content to display inside the box */
  children: ReactNode;
  /** Optional title for the background info box (defaults to "Background Info") */
  title?: string;
  /** Optional CSS class name for additional styling */
  className?: string;
  /** Optional icon to display (defaults to InfoIcon) */
  icon?: ReactNode;
}

/**
 * BackgroundInfo Component
 * @component
 * @param {BackgroundInfoProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
export function BackgroundInfo({
  children,
  title = "Background Info",
  className = "",
  icon = <InfoIcon className="w-4 h-4" />
}: BackgroundInfoProps): JSX.Element {
  return (
    <div className={cn(
      "mt-[-2px] mb-1 py-1 px-6 rounded-lg border", // Reduced top margin by 2px (from my-1 to mt-[-2px] mb-1)
      "bg-blue-100 dark:bg-blue-900/20", // Changed light mode background from blue-50 to blue-100
      "border-blue-200 dark:border-blue-800",
      className
    )}>
      {/* Use items-baseline for better icon-text alignment */}
      <div className="flex items-baseline gap-1 mb-4 mt-[-12px]"> {/* Reduced top margin by 2px */}
        <div className="text-blue-600 dark:text-blue-400 flex-shrink-0"> {/* Removed flex items-center and mt offset */}
          {icon}
        </div>
        <h4 className="font-medium text-lg text-blue-700 dark:text-blue-300">
          {title}
        </h4>
      </div>
      <div className="prose-sm dark:prose-invert text-blue-800 dark:text-blue-200">
        {children}
      </div>
    </div>
  );
}
