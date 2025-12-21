/**
 * Main Navigation Component
 *
 * Provides the primary navigation bar for the application.
 * Supports nested navigation items with:
 * - Desktop: Hover-triggered dropdown menus
 * - Mobile: Tap-to-expand accordion sections
 */

"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SocialIcons } from "@/components/ui/social-icons/social-icons.client";
import { ExpandableNavItem } from "./expandable-nav-item.client";
import { NavigationLink } from "./navigation-link.client";
import { navigationLinks } from "./navigation-links";

export function Navigation() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleMobileMenuClose = () => setIsMenuOpen(false);

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
        <div className="flex flex-wrap whitespace-nowrap space-x-1 items-center">
          {navigationLinks.map(link =>
            link.children && link.children.length > 0 ? (
              <ExpandableNavItem key={link.path} link={link} currentPath={pathname} isMobile={false} />
            ) : (
              <NavigationLink key={link.path} currentPath={pathname} {...link} />
            ),
          )}
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMenuOpen && (
        <div
          data-testid="mobile-menu"
          className="sm:hidden absolute top-full left-0 right-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-2 z-[1005]"
        >
          {navigationLinks.map(link => {
            // Override responsive settings for Contact in mobile menu
            const mobileProps = link.path === "/contact" ? { ...link, responsive: undefined } : link;

            // Render expandable items for links with children
            if (link.children && link.children.length > 0) {
              return (
                <ExpandableNavItem
                  key={link.path}
                  link={mobileProps}
                  currentPath={pathname}
                  isMobile={true}
                  onLinkClick={handleMobileMenuClose}
                />
              );
            }

            return (
              <NavigationLink
                key={link.path}
                currentPath={pathname}
                {...mobileProps}
                className="block w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={handleMobileMenuClose}
              />
            );
          })}

          {/* Mobile menu social icons */}
          <div className="px-4 pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center">
              <SocialIcons excludePlatforms={["discord", "bluesky"]} />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
