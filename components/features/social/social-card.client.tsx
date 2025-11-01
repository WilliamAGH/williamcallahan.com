"use client";

/**
 * Social Card Client Component
 * @module components/features/social/social-card.client
 * @description
 * Client component that displays a beautiful card for a social media profile.
 * Uses a similar card design to the bookmarks feature.
 * Fetches OpenGraph images for profile and banner, with fallbacks.
 */

import { ExternalLink } from "@/components/ui/external-link.client";
import Image from "next/image";
import React, { type JSX, useCallback, useEffect, useState } from "react";
import type { SocialCardProps } from "@/types/features/social";
import { cn } from "@/lib/utils";
import { buildCdnUrl, getCdnConfigFromEnv } from "@/lib/utils/cdn-utils";

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
    domain = urlObj.hostname.replace(/^www\./, "");
  } catch (error: unknown) {
    void error;
    console.error(`Invalid URL format: ${href}`);
    domain = href.replace(/^https?:\/\/|www\./g, "").split("/")[0] ?? "unknown";
  }

  let serviceName = "";
  if (label?.includes("(")) {
    const parts = label.split("(");
    serviceName = parts[0]?.trim() ?? "";
  } else if (domain) {
    const parts = domain.split(".");
    serviceName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : "";
    if (!serviceName) serviceName = "";
  }

  if (serviceName === "X") serviceName = "Twitter";
  if (serviceName === "Bsky") serviceName = "Bluesky";

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(timer);
  }, []);

  /**
   * Retrieves a fallback URL for a profile image based on the social network label.
   * Uses S3 CDN URLs directly without static-image-mapping.json dependency.
   * @param {string} networkLabel - The label of the social network.
   * @returns {string} The URL of the fallback profile image.
   */
  const getProfileFallbackImage = useCallback((networkLabel: string): string => {
    const cdnConfig = getCdnConfigFromEnv();

    try {
      if (networkLabel.includes("GitHub")) {
        const usernameMatch = networkLabel.match(/@(\w+)/);
        const username = usernameMatch?.[1] || "WilliamAGH";
        // 1️⃣ direct avatar (fast, cached by GitHub)
        return `https://avatars.githubusercontent.com/${username}?s=256&v=4`;
      }
      if (networkLabel.includes("X") || networkLabel.includes("Twitter"))
        return buildCdnUrl("images/social-media/profiles/x_5469c2d0.jpg", cdnConfig);
      if (networkLabel.includes("LinkedIn"))
        return buildCdnUrl("images/social-media/profiles/linkedin_cd280279.jpg", cdnConfig);
      if (networkLabel.includes("Bluesky")) {
        // Use personal avatar from CDN
        return buildCdnUrl("images/other/profile/william_5469c2d0.jpg", cdnConfig);
      }
      if (networkLabel.includes("Discord"))
        return buildCdnUrl("images/social-media/profiles/discord_5a093069.jpg", cdnConfig);
    } catch (error: unknown) {
      void error;
      console.error(`Error getting profile image for ${networkLabel}:`);
      if (networkLabel.includes("GitHub"))
        return buildCdnUrl("images/social-media/profiles/github_72193247.jpg", cdnConfig);
      if (networkLabel.includes("X") || networkLabel.includes("Twitter"))
        return buildCdnUrl("images/social-media/profiles/x_5469c2d0.jpg", cdnConfig);
      if (networkLabel.includes("LinkedIn"))
        return buildCdnUrl("images/social-media/profiles/linkedin_cd280279.jpg", cdnConfig);
      if (networkLabel.includes("Bluesky"))
        return buildCdnUrl("images/social-media/profiles/bluesky_5a093069.jpg", cdnConfig);
      if (networkLabel.includes("Discord"))
        return buildCdnUrl("images/social-media/profiles/discord_5a093069.jpg", cdnConfig);
    }
    return buildCdnUrl("images/other/profile/william_5469c2d0.jpg", cdnConfig);
  }, []);

  /**
   * Retrieves a fallback URL for a domain/banner image based on the social network label.
   * Uses S3 CDN URLs directly without static-image-mapping.json dependency.
   * @param {string} networkLabel - The label of the social network.
   * @returns {string} The URL of the fallback domain/banner image.
   */
  const getDomainFallbackImage = useCallback((networkLabel: string): string => {
    const cdnConfig = getCdnConfigFromEnv();

    if (networkLabel.includes("GitHub"))
      return buildCdnUrl("images/social-media/banners/github_87b6d92e.svg", cdnConfig);
    if (networkLabel.includes("X") || networkLabel.includes("Twitter"))
      return buildCdnUrl("images/social-media/banners/twitter-x_4830ec25.svg", cdnConfig);
    if (networkLabel.includes("LinkedIn"))
      return buildCdnUrl("images/social-media/banners/linkedin_02a7ce76.svg", cdnConfig);
    if (networkLabel.includes("Discord"))
      return buildCdnUrl("images/social-media/banners/discord_783c1e2b.svg", cdnConfig);
    if (networkLabel.includes("Bluesky"))
      return buildCdnUrl("images/social-media/banners/bluesky_9310c7f9.png", cdnConfig);
    return buildCdnUrl("images/other/placeholders/company_90296cb3.svg", cdnConfig);
  }, []);

  /**
   * Fetches social media OpenGraph (OG) images.
   */
  const fetchSocialImages = useCallback(() => {
    // Skip API calls entirely - use static images for all social profiles
    setProfileImageUrl(getProfileFallbackImage(label));
    setDomainImageUrl(getDomainFallbackImage(label));
    setIsLoading(false);
    setImageError(false);
  }, [label, getProfileFallbackImage, getDomainFallbackImage]);

  useEffect(() => {
    if (mounted) {
      setImageError(false);
      setDomainImageUrl(getDomainFallbackImage(label));
      fetchSocialImages();
    }
  }, [label, mounted, fetchSocialImages, getDomainFallbackImage]);

  if (!mounted) {
    return (
      <div className="relative flex flex-col bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg ring-0 rounded-3xl overflow-hidden shadow-xl h-full" />
    );
  }

  const cardBrandClass =
    label.includes("LinkedIn") || domain.includes("linkedin")
      ? "linkedin-card"
      : label.includes("GitHub") || domain.includes("github")
        ? "github-card"
        : label.includes("X") || label.includes("Twitter") || domain.includes("twitter") || domain.includes("x.com")
          ? "twitter-card"
          : label.includes("Bluesky") || domain.includes("bsky")
            ? "bluesky-card"
            : label.includes("Discord") || domain.includes("discord")
              ? "discord-card"
              : "";

  // Map brand to accent colors for unified hover/glow (hex + rgb strings)
  const { accentHex, accentRgb } = (() => {
    if (label.includes("LinkedIn") || domain.includes("linkedin"))
      return { accentHex: "#0a66c2", accentRgb: "10 102 194" };
    if (label.includes("GitHub") || domain.includes("github")) return { accentHex: "#6e5494", accentRgb: "110 84 148" };
    if (label.includes("X") || label.includes("Twitter") || domain.includes("twitter") || domain.includes("x.com"))
      return { accentHex: "#1da1f2", accentRgb: "29 161 242" };
    if (label.includes("Bluesky") || domain.includes("bsky")) return { accentHex: "#0099ff", accentRgb: "0 153 255" };
    if (label.includes("Discord") || domain.includes("discord"))
      return { accentHex: "#7289da", accentRgb: "114 137 218" };
    return { accentHex: "#3b82f6", accentRgb: "59 130 246" }; // default blue-500
  })();

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
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">Image failed to load</p>
          </div>
        )}
        {domainImageUrl && !imageError && (
          <a
            href={href}
            target="_blank"
            rel="noopener"
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
                unoptimized
                onError={() => {
                  setImageError(true);
                  setDomainImageUrl(getDomainFallbackImage(label));
                }}
              />
            )}
            {!(domain.includes("github") || domain.includes("twitter") || domain.includes("x.com")) && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
            )}
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
            rel="noopener"
            className="block relative w-16 h-16 cursor-pointer rounded-full"
            title={`Visit ${profileName} profile page`}
          >
            <div className="absolute inset-0 rounded-full overflow-hidden shadow-md border-2 border-white dark:border-gray-800">
              {profileImageUrl && (
                <Image
                  src={profileImageUrl}
                  alt={`${serviceName} profile`}
                  fill
                  unoptimized
                  priority
                  sizes="64px"
                  className="object-cover"
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
              rel="noopener"
              className="flex items-center gap-2 group/title"
              title={`Visit ${profileName} profile page`}
            >
              <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{serviceName}</h3>
            </a>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{getUserHandle(href)}</p>
          </div>
        </div>

        {/* Footer with Link and Optional Badge */}
        <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          {emphasized && (
            <span className="inline-block px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-medium">
              Primary
            </span>
          )}
          <ExternalLink href={href} showIcon={true} className={cn("text-xs", emphasized ? "" : "ml-auto")}>
            {domain}
          </ExternalLink>
        </div>
      </div>
    </div>
  );
}

/**
 * Extracts a user handle from a social media URL.
 * @param {string} url - The URL of the social media profile.
 * @returns {string} The extracted user handle, prefixed with "@" where appropriate, or an empty string.
 */
function getUserHandle(url: string): string {
  if (!url) return "";
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    if (
      urlObj.hostname.includes("github.com") ||
      urlObj.hostname.includes("x.com") ||
      urlObj.hostname.includes("twitter.com")
    ) {
      return `@${pathParts[0]}`;
    }
    if (urlObj.hostname.includes("bsky.app")) {
      return `@${pathParts[1]}`;
    }
    if (urlObj.hostname.includes("linkedin.com")) {
      return pathParts[1] ? `/${pathParts[0]}/${pathParts[1]}` : `/${pathParts[0]}`;
    }
    if (urlObj.hostname.includes("discord.com")) {
      return "Community";
    }
  } catch (error: unknown) {
    void error;
    // Fallback for non-URL strings or unexpected formats
    const parts = url.split("/").filter(Boolean);
    const lastSegment = parts.pop();
    return lastSegment ?? "";
  }
  return "Profile";
}
