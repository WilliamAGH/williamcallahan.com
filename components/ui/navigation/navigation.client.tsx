/**
 * Main Navigation Component
 *
 * Provides the primary navigation bar for the application.
 * Includes responsive mobile menu and proper spacing across all devices.
 */

"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NavigationLink } from "./navigation-link.client";
import { navigationLinks } from "./navigation-links";

export function Navigation() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="flex-1">
      {/* Mobile Menu Button */}
      <div className="sm:hidden flex items-center relative z-[1010]">
        <button
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          aria-label="Toggle menu"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Desktop Navigation - keep sm:flex for test compatibility */}
      <div className="hidden sm:flex items-center">
        <div className="flex flex-wrap whitespace-nowrap space-x-1">
          {" "}
          {/* Allow wrapping */}
          {navigationLinks.map((link) => (
            <NavigationLink key={link.path} currentPath={pathname} {...link} />
          ))}
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMenuOpen && (
        <div
          data-testid="mobile-menu"
          className="sm:hidden absolute top-full left-0 right-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-2 z-[1005]"
        >
          {/* For mobile, show all navigation links including Contact regardless of screen size */}
          {navigationLinks.map((link) => {
            // Override the responsive settings for Contact in mobile menu to ensure it always appears
            const mobileProps = link.path === "/contact" ? { ...link, responsive: undefined } : link;

            return (
              <NavigationLink
                key={link.path}
                currentPath={pathname}
                {...mobileProps}
                className="block w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => setIsMenuOpen(false)}
              />
            );
          })}
        </div>
      )}
    </nav>
  );
}
