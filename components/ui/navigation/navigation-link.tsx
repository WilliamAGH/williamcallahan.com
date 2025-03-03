/**
 * Navigation Link Component
 */

import Link from 'next/link';
import { useTerminalContext } from '@/components/ui/terminal/terminalContext';
import type { NavigationLinkProps } from '@/types/navigation';

export function NavigationLink({
  path,
  name,
  currentPath,
  className = '',
  onClick
}: NavigationLinkProps) {
  const { clearHistory } = useTerminalContext();
  const isActive = currentPath === path;

  const handleClick = () => {
    clearHistory();
    onClick?.();
  };

  return (
    <Link
      href={path}
      className={`
        px-4 py-2 rounded-t-lg transition-all duration-200 text-sm
        ${isActive
          ? 'bg-white dark:bg-gray-800 shadow-sm border-t border-x border-gray-200 dark:border-gray-700'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
        }
        ${className}
      `}
      aria-current={isActive ? 'page' : undefined}
      onClick={handleClick}
    >
      {name}
    </Link>
  );
}