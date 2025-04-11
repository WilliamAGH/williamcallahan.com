/**
 * Navigation Link Component
 */
"use client"; // Add "use client" as it uses hooks

import Link from 'next/link';
// Revert to original hook name
import { useTerminalContext } from '@/components/ui/terminal/terminal-context.client';
import type { NavigationLinkProps } from '@/types/navigation';
import { useCallback } from 'react';

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

  // Memoize the click handler to prevent rerenders
  const handleClick = useCallback(() => {
    // Only clear history when actually navigating to a new page
    if (path !== currentPath) {
      clearHistory();
    }
    onClick?.();
  }, [path, currentPath, clearHistory, onClick]);

  // Create link props conditionally to avoid passing false for prefetch
  const linkProps = {
    href: path,
    className: `
      px-4 py-2 rounded-t-lg text-sm
      nav-link
      ${isActive
        ? 'bg-white dark:bg-gray-800 shadow-sm border-t border-x border-gray-200 dark:border-gray-700'
        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }
      ${className}
    `,
    // Explicitly type aria-current to match the expected values
    'aria-current': isActive ? ('page' as const) : undefined,
    onClick: handleClick,

    // Always prefetch, but with correct settings
    prefetch: true,

    // Add scroll restoration to prevent page position jumps
    scroll: false
  };

  return (
    <Link {...linkProps}>
      {name}
    </Link>
  );
}
