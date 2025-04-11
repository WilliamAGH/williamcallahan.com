/**
 * Navigation Link Component
 */
"use client"; // Add "use client" as it uses hooks

import Link from 'next/link';
// Revert to original hook name
import { useTerminalContext } from '@/components/ui/terminal/terminal-context.client';
import type { NavigationLinkProps } from '@/types/navigation';

// Important pages that should be prefetched for faster navigation
const PRIORITY_PATHS = ['/projects', '/blog', '/experience', '/contact'];

export function NavigationLink({
  path,
  name,
  currentPath,
  className = '',
  onClick
}: NavigationLinkProps) {
  // Use the original hook name
  const { clearHistory } = useTerminalContext();
  const isActive = currentPath === path;

  // Determine if this link should be prefetched
  const shouldPrefetch = PRIORITY_PATHS.includes(path);

  const handleClick = () => {
    clearHistory();
    onClick?.();
  };

  // Create link props conditionally to avoid passing false for prefetch
  const linkProps = {
    href: path,
    className: `
      px-4 py-2 rounded-t-lg text-sm
      ${isActive
        ? 'bg-white dark:bg-gray-800 shadow-sm border-t border-x border-gray-200 dark:border-gray-700'
        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }
      ${className}
    `,
    // Explicitly type aria-current to match the expected values
    'aria-current': isActive ? ('page' as const) : undefined,
    onClick: handleClick,
    ...(shouldPrefetch ? { prefetch: true } : {}) // Only add prefetch prop when true
  };

  return (
    <Link {...linkProps}>
      {name}
    </Link>
  );
}
