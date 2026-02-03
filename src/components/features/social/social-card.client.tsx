/**
 * Social Card Client Component
 * @module components/features/social/social-card.client
 * @description
 * Client component that displays a card for a social media profile.
 * Profile and banner images resolve to direct CDN URLs when available,
 * and fall back to the image proxy for third-party origins.
 */

"use client";

import { ExternalLink } from "@/components/ui/external-link.client";
import Image from "next/image";
import React, { type JSX, useCallback, useEffect, useState } from "react";
import type { SocialCardProps } from "@/types/features/social";
import { cn } from "@/lib/utils";
import {
  buildCdnUrl,
  getCdnConfigFromEnv,
  getOptimizedImageSrc,
  shouldBypassOptimizer,
} from "@/lib/utils/cdn-utils";
import { stripWwwPrefix } from "@/lib/utils/url-utils";
import {
  BANNER_IMAGE_PATHS,
  CARD_BRAND_CLASSES,
  DEFAULT_BANNER_IMAGE,
  DEFAULT_GITHUB_USERNAME,
  DEFAULT_PROFILE_IMAGE,
  MOUNT_DELAY_MS,
  PROFILE_IMAGE_PATHS,
  PROFILE_IMAGE_WIDTH_PX,
  detectSocialPlatform,
  getSocialAccentColors,
  getUserHandle,
} from "./social-card-config";

/**
 * Client-side component for rendering a social media profile card.
 * It handles image fetching (profile and banner) with fallbacks and displays social link details.
 * @param {SocialCardProps} props - The properties for the component.
 * @returns {JSX.Element} The rendered social card.
 */
export function SocialCardClient({ social }: SocialCardProps): JSX.Element {
  const href = social.href;
  const label = social.label;
  const Icon = social.icon as React.ComponentType<React.SVGProps<SVGSVGElement>>;
  const emphasized = Boolean(social.emphasized);

  const [imageError, setImageError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [domainImageUrl, setDomainImageUrl] = useState<string | null>(null);

  let domain = "";
  try {
    const urlObj = new URL(href);
    domain = stripWwwPrefix(urlObj.hostname);
  } catch {
    // URL parsing failure expected for malformed hrefs - extract domain from string directly
    domain = stripWwwPrefix(href.replace(/^https?:\/\//g, "")).split("/")[0] ?? "unknown";
  }

  let serviceName = "";
  if (label?.includes("(")) {
    const parts = label.split("(");
    serviceName = parts[0]?.trim() ?? "";
  } else if (domain) {
    const parts = domain.split(".");
    serviceName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : "";
  }

  if (serviceName === "X") serviceName = "Twitter";
  if (serviceName === "Bsky") serviceName = "Bluesky";

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), MOUNT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  /**
   * Resolves image URLs so CDN sources stay direct and external URLs are proxied.
   */
  const resolveImageUrl = useCallback((url: string, width?: number): string => {
    // Pass undefined for config to use env defaults; width requires positional arg
    const optimized = getOptimizedImageSrc(url, undefined, width);
    if (!optimized) {
      console.warn(`[SocialCard] Missing optimized image URL for ${url}`);
      return url;
    }
    return optimized;
  }, []);

  /**
   * Returns the optimized fallback profile image URL for a given social label.
   */
  const getProfileFallbackImage = useCallback(
    (networkLabel: string): string => {
      const cdnConfig = getCdnConfigFromEnv();
      const platform = detectSocialPlatform(networkLabel, "");

      // GitHub uses live avatar API
      if (platform === "github") {
        const usernameMatch = networkLabel.match(/@(\w+)/);
        const username = usernameMatch?.[1] ?? DEFAULT_GITHUB_USERNAME;
        return resolveImageUrl(
          `https://avatars.githubusercontent.com/${username}?s=256&v=4`,
          PROFILE_IMAGE_WIDTH_PX,
        );
      }

      // Other platforms use CDN-hosted profile images
      const imagePath = platform ? PROFILE_IMAGE_PATHS[platform] : null;
      if (imagePath) {
        return resolveImageUrl(buildCdnUrl(imagePath, cdnConfig), PROFILE_IMAGE_WIDTH_PX);
      }

      // Default fallback
      return resolveImageUrl(buildCdnUrl(DEFAULT_PROFILE_IMAGE, cdnConfig), PROFILE_IMAGE_WIDTH_PX);
    },
    [resolveImageUrl],
  );

  /**
   * Returns the optimized fallback banner/domain image URL for a given social label.
   */
  const getDomainFallbackImage = useCallback(
    (networkLabel: string): string => {
      const cdnConfig = getCdnConfigFromEnv();
      const platform = detectSocialPlatform(networkLabel, "");
      const imagePath = platform ? BANNER_IMAGE_PATHS[platform] : null;

      if (imagePath) {
        return resolveImageUrl(buildCdnUrl(imagePath, cdnConfig));
      }

      return resolveImageUrl(buildCdnUrl(DEFAULT_BANNER_IMAGE, cdnConfig));
    },
    [resolveImageUrl],
  );

  /**
   * Resolves and sets the profile and domain images via optimized URLs.
   */
  const fetchSocialImages = useCallback(() => {
    const profile = getProfileFallbackImage(label);
    const domainBanner = getDomainFallbackImage(label);

    setProfileImageUrl(profile);
    setDomainImageUrl(domainBanner);
    setIsLoading(false);
    setImageError(false);
  }, [label, getProfileFallbackImage, getDomainFallbackImage]);

  useEffect(() => {
    if (!mounted) return;
    fetchSocialImages();
  }, [mounted, fetchSocialImages]);

  if (!mounted) {
    return (
      <div className="relative flex flex-col bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg ring-0 rounded-3xl overflow-hidden shadow-xl h-full" />
    );
  }

  const platform = detectSocialPlatform(label, domain);
  const cardBrandClass = platform ? (CARD_BRAND_CLASSES[platform] ?? "") : "";

  // Map brand to accent colors for unified hover/glow (hex + rgb strings)
  const { accentHex, accentRgb } = getSocialAccentColors(label, domain);

  const profileName = serviceName || domain || "social";

  return (
    <div
      className={cn(
        "relative flex flex-col bg-gray-50 dark:bg-gray-800/40 ring-0 rounded-2xl overflow-hidden shadow-md border border-transparent group h-full social-card transition-transform min-h-[260px]",
        cardBrandClass,
      )}
      style={{ "--accent": accentHex, "--accent-rgb": accentRgb } as React.CSSProperties}
    >
      {/* Header with Banner */}
      <div
        className={cn(
          "relative w-full h-32 overflow-hidden",
          domain.includes("github") && "bg-white", // GitHub white background in all modes
          (domain.includes("twitter") || domain.includes("x.com")) && "bg-white", // X.com white background in all modes
          !(domain.includes("github") || domain.includes("twitter") || domain.includes("x.com")) &&
            "bg-gray-100 dark:bg-gray-800", // Default background
        )}
      >
        {isLoading && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <div className="w-6 h-6 border-2 border-gray-400 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}
        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-100/50 dark:bg-red-900/30">
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">
              Image failed to load
            </p>
          </div>
        )}
        {domainImageUrl && !imageError && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 z-10 w-full h-full cursor-pointer block"
            title={`Visit ${profileName} profile page`}
            style={
              domainImageUrl.endsWith(".svg") &&
              (domain.includes("github") || domain.includes("twitter") || domain.includes("x.com"))
                ? {
                    backgroundImage: `url(${domainImageUrl})`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                    backgroundSize: domain.includes("github") ? "40%" : "45%",
                  }
                : undefined
            }
          >
            {!(
              domainImageUrl.endsWith(".svg") &&
              (domain.includes("github") || domain.includes("twitter") || domain.includes("x.com"))
            ) && (
              <Image
                src={domainImageUrl}
                alt={`${serviceName} branding`}
                className={cn("w-full h-full object-cover social-banner", {
                  "linkedin-banner": domain.includes("linkedin"),
                })}
                fill
                sizes="100vw"
                {...(shouldBypassOptimizer(domainImageUrl ?? undefined)
                  ? { unoptimized: true }
                  : {})}
                onError={() => {
                  setImageError(true);
                  setDomainImageUrl(getDomainFallbackImage(label));
                }}
              />
            )}
            {!(
              domain.includes("github") ||
              domain.includes("twitter") ||
              domain.includes("x.com")
            ) && <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />}
          </a>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 px-5 py-4 flex flex-col">
        {/* Profile Image and Title */}
        <div className="flex items-start -mt-10 z-10">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block relative w-16 h-16 cursor-pointer rounded-full"
            title={`Visit ${profileName} profile page`}
          >
            <div className="absolute inset-0 rounded-full overflow-hidden shadow-md border-2 border-white dark:border-gray-800">
              {profileImageUrl && (
                <Image
                  src={profileImageUrl}
                  alt={`${serviceName} profile`}
                  fill
                  priority
                  sizes="64px"
                  className="object-cover"
                  {...(shouldBypassOptimizer(profileImageUrl ?? undefined)
                    ? { unoptimized: true }
                    : {})}
                  onError={() => {
                    setImageError(true);
                    setProfileImageUrl(getProfileFallbackImage(label));
                  }}
                />
              )}
            </div>
          </a>
          <div className="ml-4 mt-12 flex-grow">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 group/title"
              title={`Visit ${profileName} profile page`}
            >
              <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{serviceName}</h3>
            </a>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
              {getUserHandle(href)}
            </p>
          </div>
        </div>

        {/* Footer with Link and Optional Badge */}
        <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          {emphasized && (
            <span className="inline-block px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-medium">
              Primary
            </span>
          )}
          <ExternalLink
            href={href}
            showIcon={true}
            className={cn("text-xs", emphasized ? "" : "ml-auto")}
          >
            {domain}
          </ExternalLink>
        </div>
      </div>
    </div>
  );
}
