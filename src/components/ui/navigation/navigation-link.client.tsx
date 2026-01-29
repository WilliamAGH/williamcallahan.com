/**
 * Navigation Link Component
 */
"use client"; // Add "use client" as it uses hooks
import type { NavigationLinkProps } from "@/types/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";

// Important pages that should be prefetched for faster navigation
const PRIORITY_PATHS = new Set(["/projects", "/blog", "/experience", "/contact"]);

// Navigation cooldown settings
const NAVIGATION_COOLDOWN = 300; // ms

export function NavigationLink({
  path,
  name,
  responsive,
  currentPath,
  className = "",
  onClick,
}: NavigationLinkProps) {
  // Routes that should use prefix matching (have child routes)
  const prefixMatchRoutes = ["/bookmarks", "/blog", "/projects"];

  // Determine if this link should be active
  const isActive = prefixMatchRoutes.includes(path)
    ? currentPath.startsWith(path)
    : currentPath === path;
  // Use useRef to store the last navigation timestamp reliably across renders and tests
  const lastNavigationTimeRef = useRef(0);

  // Track navigation state
  const [isNavigating, setIsNavigating] = useState(false);

  // Determine if this link should be prefetched
  const shouldPrefetch = PRIORITY_PATHS.has(path);

  // Click handler (no hook dependency warnings)
  const handleClick = (e: MouseEvent) => {
    const now = Date.now();

    // Prevent rapid navigation clicks (possible server switching)
    if (now - lastNavigationTimeRef.current < NAVIGATION_COOLDOWN) {
      e.preventDefault();
      return;
    }

    // No direct coupling to terminal; history clearing handled by TerminalProvider on route change

    lastNavigationTimeRef.current = now;
    setIsNavigating(true);
    onClick?.();
  };

  // Reset navigation state after timeout
  useEffect(() => {
    if (isNavigating) {
      const timer = setTimeout(() => {
        setIsNavigating(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isNavigating]);

  // Handle responsive display classes based on responsive settings
  const getResponsiveClasses = () => {
    if (!responsive) return "";

    let classes = "";

    if (responsive.hideBelow) {
      switch (responsive.hideBelow) {
        case "sm":
          classes += "hidden sm:inline-block ";
          break;
        case "md":
          classes += "hidden md:inline-block ";
          break;
        case "lg":
          classes += "hidden lg:inline-block ";
          break;
        case "xl":
          classes += "hidden xl:inline-block ";
          break;
        case "2xl":
          classes += "hidden 2xl:inline-block ";
          break;
      }
    }

    if (responsive.hideAbove) {
      switch (responsive.hideAbove) {
        case "sm":
          classes += "sm:hidden ";
          break;
        case "md":
          classes += "md:hidden ";
          break;
        case "lg":
          classes += "lg:hidden ";
          break;
        case "xl":
          classes += "xl:hidden ";
          break;
        case "2xl":
          classes += "2xl:hidden ";
          break;
      }
    }

    return classes;
  };

  // Create link props conditionally to avoid passing false for prefetch
  const linkProps = {
    href: path,
    className: `
      px-4 py-2 rounded-t-lg text-sm
      nav-link
      ${
        isActive
          ? "bg-white dark:bg-gray-800 shadow-sm border-t border-x border-gray-200 dark:border-gray-700"
          : "hover:bg-gray-100 dark:hover:bg-gray-700"
      }
      ${isNavigating ? "pointer-events-none opacity-80" : ""}
      ${getResponsiveClasses()}
      ${className}
    `,
    // Provide correct ARIA attribute for current page indication
    ...(isActive ? { "aria-current": "page" as const } : {}),
    onClick: handleClick,

    // Use the shouldPrefetch variable to determine if this link should be prefetched
    prefetch: shouldPrefetch,

    // Use scroll={false} to prevent scroll position jumps
    // This property will cause a React warning in tests but is needed for Next.js functionality
    // We accept this warning as it doesn't affect production functionality
    scroll: false,
  };

  return (
    <Link {...linkProps}>
      {name === "Projects Sandbox" ? (
        <>
          Projects<span className="hidden md:inline"> Sandbox</span>
        </>
      ) : (
        name
      )}
    </Link>
  );
}
