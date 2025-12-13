/**
 * Expandable Navigation Item
 *
 * Handles nav items with nested children:
 * - Desktop: Hover dropdown
 * - Mobile: Tap-to-expand accordion
 */

"use client";

import type { ExpandableNavItemProps } from "@/types/navigation";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";

const HOVER_CLOSE_DELAY = 150;

export function ExpandableNavItem({ link, currentPath, isMobile = false, onLinkClick }: ExpandableNavItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if current path matches this item or any child
  const isActive = currentPath === link.path || currentPath.startsWith(`${link.path}/`);
  const hasActiveChild = link.children?.some(c => currentPath === c.path) ?? false;
  const isHighlighted = isActive || hasActiveChild;

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (isMobile) return;
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (isMobile) return;
    closeTimeoutRef.current = setTimeout(() => setIsOpen(false), HOVER_CLOSE_DELAY);
  };

  const handleExpandClick = (e: MouseEvent) => {
    if (!isMobile) return;
    e.preventDefault();
    setIsOpen(!isOpen);
  };

  const handleChildClick = () => {
    setIsOpen(false);
    onLinkClick?.();
  };

  const chevronClasses = `transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`;

  // Desktop: hover dropdown
  if (!isMobile) {
    return (
      <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        <Link
          href={link.path}
          className={`
            px-4 py-2 rounded-t-lg text-sm nav-link inline-flex items-center gap-1
            ${
              isHighlighted
                ? "bg-white dark:bg-gray-800 shadow-sm border-t border-x border-gray-200 dark:border-gray-700"
                : "hover:bg-gray-100 dark:hover:bg-gray-700"
            }
          `}
          aria-current={isActive ? "page" : undefined}
          aria-expanded={isOpen}
          onClick={onLinkClick}
        >
          {link.name}
          <ChevronDown size={14} className={`${chevronClasses} text-gray-400`} aria-hidden />
        </Link>

        <div
          className={`
            absolute left-0 top-full z-[1020] min-w-[140px] pt-1 origin-top
            transition-all duration-200 ease-out
            ${isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}
          `}
        >
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
            {link.children?.map(child => (
              <Link
                key={child.path}
                href={child.path}
                className={`
                  block px-4 py-2.5 text-sm transition-colors
                  ${
                    currentPath === child.path
                      ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
                      : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  }
                `}
                aria-current={currentPath === child.path ? "page" : undefined}
                onClick={handleChildClick}
              >
                {child.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Mobile: expandable accordion
  return (
    <div className="w-full">
      <div className="flex items-center w-full">
        <Link
          href={link.path}
          className={`
            flex-1 px-4 py-2 text-sm
            ${
              isHighlighted
                ? "bg-gray-100 dark:bg-gray-700 font-medium text-gray-900 dark:text-white"
                : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            }
          `}
          aria-current={isActive ? "page" : undefined}
          onClick={onLinkClick}
        >
          {link.name}
        </Link>
        <button
          type="button"
          onClick={handleExpandClick}
          className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${link.name}`}
        >
          <ChevronDown size={16} className={chevronClasses} aria-hidden />
        </button>
      </div>

      <div
        className={`
          overflow-hidden transition-all duration-200 ease-out
          ${isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}
        `}
      >
        <div className="border-l-2 border-gray-200 dark:border-gray-600 ml-4 bg-gray-50/50 dark:bg-gray-800/50">
          {link.children?.map(child => (
            <Link
              key={child.path}
              href={child.path}
              className={`
                block px-4 py-2 text-sm transition-colors
                ${
                  currentPath === child.path
                    ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                }
              `}
              aria-current={currentPath === child.path ? "page" : undefined}
              onClick={handleChildClick}
            >
              {child.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
