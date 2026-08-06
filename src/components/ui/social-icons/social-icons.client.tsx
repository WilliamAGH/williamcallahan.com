/**
 * Social Icons Component
 *
 * Displays social media icons with links to the author's profiles.
 */

"use client";

import { IconWrapper } from "@/components/utils/icon-wrapper.client";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import React from "react";
import { ErrorBoundary } from "../error-boundary.client";
import { socialLinks } from "./social-links";
import type { SocialIconsProps } from "@/types/ui/social";

const PLATFORM_SLUGS = ["github", "x", "discord", "linkedin", "bluesky"] as const;
const isPlatformSlug = (value: string): value is (typeof PLATFORM_SLUGS)[number] =>
  (PLATFORM_SLUGS as readonly string[]).includes(value);

export function SocialIcons({
  className = "",
  showXOnly = false,
  excludePlatforms = [],
}: SocialIconsProps) {
  // Icon button styling
  const iconButtonClasses =
    "flex items-center justify-center p-1 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all duration-200 ease-in-out hover:scale-110 active:scale-100";

  // Compute links to render based on props
  const linksToShow = React.useMemo(() => {
    const base = showXOnly
      ? socialLinks.filter((link) => link.label === "X (Twitter)")
      : socialLinks;
    if (!excludePlatforms.length) return base;
    return base.filter(
      (link) => !(isPlatformSlug(link.platform) && excludePlatforms.includes(link.platform)),
    );
  }, [showXOnly, excludePlatforms]);

  // Use a very small gap to vastly reduce space as requested.
  const spacingClass = className.includes("gap-") ? "" : "gap-0.5";

  return (
    <div className={`flex items-center justify-center ${spacingClass} ${className}`}>
      {linksToShow.map((link) => (
        <ErrorBoundary key={link.href} silent>
          <Link
            href={link.href}
            className={iconButtonClasses}
            target="_blank"
            // rel="noopener noreferrer" is the common practice, but noreferrer is
            // intentionally omitted to allow for referrer-based analytics on my own projects.
            rel="noopener"
            aria-label={link.label}
            title={link.label}
          >
            <IconWrapper icon={link.icon as LucideIcon} className="w-5 h-5" />
          </Link>
        </ErrorBoundary>
      ))}
    </div>
  );
}
