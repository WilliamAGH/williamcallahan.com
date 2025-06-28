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
import { ExternalLink as LucideExternalLinkIcon } from "lucide-react";
import Image from "next/image";
import type React from "react";
import { type JSX, useCallback, useEffect, useState } from "react";
import type { SocialCardProps } from "@/types/features/social";
import { getStaticImageUrl } from "@/lib/data-access/static-images";

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
  } catch (_error) {
    // Changed error to _error
    console.error(`Invalid URL format: ${href}`, _error);
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
   * @param {string} networkLabel - The label of the social network.
   * @returns {string} The URL of the fallback profile image.
   */
  const getProfileFallbackImage = useCallback((networkLabel: string): string => {
    try {
      if (networkLabel.includes("GitHub")) {
        const usernameMatch = networkLabel.match(/@(\w+)/);
        const username = usernameMatch?.[1] || "WilliamAGH";
        // 1️⃣ direct avatar (fast, cached by GitHub)
        return `https://avatars.githubusercontent.com/${username}?s=256&v=4`;
      }
      if (networkLabel.includes("X") || networkLabel.includes("Twitter"))
        return getStaticImageUrl("/images/social-pics/x.jpg");
      if (networkLabel.includes("LinkedIn")) return getStaticImageUrl("/images/social-pics/linkedin.jpg");
      if (networkLabel.includes("Bluesky")) {
        // Use personal avatar from CDN, fallback handled in catch block
        return getStaticImageUrl("/images/william.jpeg");
      }
      if (networkLabel.includes("Discord")) return getStaticImageUrl("/images/social-pics/discord.jpg");
    } catch (_error) {
      // Changed error to _error
      console.error(`Error getting profile image for ${networkLabel}:`, _error);
      if (networkLabel.includes("GitHub")) return getStaticImageUrl("/images/social-pics/github.jpg");
      if (networkLabel.includes("X") || networkLabel.includes("Twitter"))
        return getStaticImageUrl("/images/social-pics/x.jpg");
      if (networkLabel.includes("LinkedIn")) return getStaticImageUrl("/images/social-pics/linkedin.jpg");
      if (networkLabel.includes("Bluesky")) return getStaticImageUrl("/images/social-pics/bluesky.jpg");
      if (networkLabel.includes("Discord")) return getStaticImageUrl("/images/social-pics/discord.jpg");
    }
    return getStaticImageUrl("/images/william.jpeg");
  }, []);

  /**
   * Retrieves a fallback URL for a domain/banner image based on the social network label.
   * @param {string} networkLabel - The label of the social network.
   * @returns {string} The URL of the fallback domain/banner image.
   */
  const getDomainFallbackImage = useCallback((networkLabel: string): string => {
    if (networkLabel.includes("GitHub")) return getStaticImageUrl("/images/social-banners/github.svg");
    if (networkLabel.includes("X") || networkLabel.includes("Twitter"))
      return getStaticImageUrl("/images/social-banners/twitter-x.svg");
    if (networkLabel.includes("LinkedIn")) return getStaticImageUrl("/images/social-banners/linkedin.svg");
    if (networkLabel.includes("Discord")) return getStaticImageUrl("/images/social-banners/discord.svg");
    if (networkLabel.includes("Bluesky")) return getStaticImageUrl("/images/social-banners/bluesky.png");
    return getStaticImageUrl("/images/company-placeholder.svg");
  }, []);

  /**
   * Fetches social media OpenGraph (OG) images.
   */
  const fetchSocialImages = useCallback(
    () => {
      // Skip API calls entirely - use static images for all social profiles
      setProfileImageUrl(getProfileFallbackImage(label));
      setDomainImageUrl(getDomainFallbackImage(label));
      setIsLoading(false);
      setImageError(false);
    },
    [label, getProfileFallbackImage, getDomainFallbackImage],
  );

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

  const profileName = serviceName || domain || "social";

  return (
    <div
      className={`relative flex flex-col bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg ring-0 rounded-3xl overflow-hidden shadow-xl border border-transparent group ${cardBrandClass} h-full`}
    >
      <div className="relative w-full aspect-video overflow-hidden rounded-t-3xl bg-gray-100 dark:bg-gray-800">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <div className="w-8 h-8 border-2 border-gray-400 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}
        <div className="absolute inset-0 w-full h-full overflow-hidden rounded-t-3xl">
          {domainImageUrl && (
            <div className="absolute inset-0 w-full h-full overflow-hidden">
              <a
                href={href}
                target="_blank"
                rel="noopener"
                className="absolute inset-0 z-20 w-full h-full cursor-pointer block"
                title={`Visit ${profileName} profile page`}
              >
                <span className="sr-only">Visit {serviceName || "social"} profile</span>
              </a>
              <div className="absolute inset-0 w-full h-full">
                {domain.includes("linkedin") ? (
                  <Image
                    src={domainImageUrl}
                    alt={serviceName ? `${serviceName} branding` : "Social media branding"}
                    className="w-full h-full object-cover linkedin-banner"
                    fill
                    unoptimized={true}
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <Image
                    src={domainImageUrl}
                    alt={serviceName ? `${serviceName} branding` : "Social media branding"}
                    className="w-full h-full object-cover social-banner"
                    fill
                    unoptimized={true}
                    onError={() => setImageError(true)}
                  />
                )}
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-br from-transparent via-black/10 to-black/30 dark:from-transparent dark:via-black/20 dark:to-black/50" />
          {profileImageUrl && (
            <div className="absolute bottom-4 right-4 z-10">
              <a
                href={href}
                target="_blank"
                rel="noopener"
                className="block relative w-12 h-12 md:w-16 md:h-16 cursor-pointer rounded-full"
                title={`Visit ${profileName} profile page`}
              >
                <div className="absolute inset-0 rounded-full overflow-hidden shadow-lg border-2 border-white/70 dark:border-gray-700/70">
                  <Image
                    src={profileImageUrl}
                    alt={serviceName ? `${serviceName} profile` : "Social media profile"}
                    fill
                    unoptimized={true}
                    priority={true}
                    sizes="(max-width: 767px) 48px, 64px"
                    className="object-cover"
                    onError={() => setProfileImageUrl(getProfileFallbackImage(label))}
                  />
                </div>
                <div className="absolute -inset-1 -z-0 rounded-full bg-white/30 dark:bg-white/20 blur-sm" />
              </a>
            </div>
          )}
        </div>
        {(!profileImageUrl || !domainImageUrl || imageError) && !isLoading && (
          <div className="absolute inset-0 z-5 flex items-center justify-center w-full h-full bg-gray-100 dark:bg-gray-800">
            <Icon className="w-32 h-32 text-gray-800 dark:text-gray-200" />
          </div>
        )}
        <ExternalLink
          href={href}
          showIcon={false}
          className="absolute bottom-3 left-3 bg-white/80 dark:bg-gray-800/80 px-3 py-1 flex items-center space-x-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <LucideExternalLinkIcon className="w-4 h-4 text-gray-700 dark:text-gray-200" />
          <span className="text-sm text-gray-700 dark:text-gray-200">{domain}</span>
        </ExternalLink>
      </div>
      <div className="flex-1 p-6 flex flex-col gap-3.5">
        <a
          href={href}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-2.5 group/title"
          title={`Visit ${profileName} profile page`}
        >
          <Icon className="w-6 h-6 text-gray-700 dark:text-gray-300 group-hover/title:text-blue-600 transition-colors" />
          <span className="text-2xl font-semibold text-gray-900 dark:text-white group-hover/title:text-blue-600 transition-colors">
            {serviceName}
          </span>
        </a>
        <p className="flex-1 text-gray-700 dark:text-gray-300 text-base leading-6 overflow-hidden">
          {getNetworkDescription(label)}
        </p>
        <div className="mt-auto space-y-2 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <a
              href={href}
              target="_blank"
              rel="noopener"
              className="font-mono hover:text-blue-600 transition-colors"
              title={`Visit ${profileName} profile page`}
            >
              {getUserHandle(href)}
            </a>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5 mt-3 pt-4 pb-2 border-t border-gray-200 dark:border-gray-700">
          <span className="inline-block px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-medium transition-colors hover:bg-indigo-200 dark:hover:bg-indigo-800/60 transform hover:scale-102">
            {getNetworkCategory(label)}
          </span>
          {emphasized && (
            <span className="inline-block px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-medium">
              Primary
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Generates a description for a social network based on its label.
 * @param {string} label - The label of the social network.
 * @returns {string} A descriptive string for the network.
 */
function getNetworkDescription(label: string): string {
  if (label.includes("GitHub")) return "My code repositories and open source contributions.";
  if (label.includes("X") || label.includes("Twitter"))
    return "Sharing thoughts on tech, startups, and investing while enjoying Twitter humor!";
  if (label.includes("LinkedIn")) return "Obligatory LinkedIn updates and professional profile.";
  if (label.includes("Discord")) return "Live chat and messaging on ~100 topic-based servers.";
  if (label.includes("Bluesky")) return "Decentralized Twitter alternative.";
  return "Connecting and sharing updates.";
}

/**
 * Determines the category of a social network based on its label.
 * @param {string} label - The label of the social network.
 * @returns {string} The category of the network (e.g., "Development", "Social").
 */
function getNetworkCategory(label: string): string {
  if (label.includes("GitHub")) return "Development";
  if (label.includes("X") || label.includes("Twitter") || label.includes("Bluesky")) return "Social";
  if (label.includes("LinkedIn")) return "Professional";
  if (label.includes("Discord")) return "Community";
  return "Social";
}

/**
 * Extracts a user handle from a social media URL.
 * @param {string} url - The URL of the social media profile.
 * @returns {string} The extracted user handle, prefixed with "@" where appropriate, or an empty string.
 */
function getUserHandle(url: string): string {
  if (!url) return "";
  const parts = url.split("/");
  const handle = parts.length > 0 ? parts[parts.length - 1] || "" : "";
  if (handle && !handle.includes(".")) return `@${handle}`;
  if (url.includes("bsky.app/profile/")) return `@${handle}`;
  if (url.includes("discord.com/users/")) return handle;
  return handle;
}
