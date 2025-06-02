"use client";

/**
 * Social Card Client Component
 * @module components/features/social/social-card.client
 * @description
 * Client component that displays a beautiful card for a social media profile
 * Uses a similar card design to the bookmarks feature
 */

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ExternalLink as LucideExternalLinkIcon } from 'lucide-react';
import { ExternalLink } from '@/components/ui/external-link.client';
import { type SocialLink } from '@/types/social';
// SocialCardEffects is unused and can be removed

interface SocialCardProps {
  social: SocialLink;
  // Removed isDarkTheme as it's unused
}

export function SocialCardClient({ social }: SocialCardProps): JSX.Element {
  // Safe destructuring with explicit typing
  const href: string = social.href;
  const label: string = social.label;
  // Use type assertion to safely convert from 'any' to a specific React component type
  const Icon = social.icon as React.ComponentType<React.SVGProps<SVGSVGElement>>;
  const emphasized: boolean = social.emphasized || false;
  const [imageError, setImageError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Extract domain from the URL for display
  let domain = '';
  try {
    const urlObj = new URL(href);
    domain = urlObj.hostname.replace(/^www\./, '');
  } catch (error) {
    console.error(`Invalid URL format: ${href}`, error);
    // Basic fallback: remove protocol and www., take first part of path
    domain = href.replace(/^https?:\/\/|www\./g, '').split('/')[0] || 'unknown';
  }

  // Determine the service name from the domain or label with proper naming for X/Twitter and Bluesky
  let serviceName = '';
  if (label && label.includes('(')) {
    const parts = label.split('(');
    serviceName = parts[0]?.trim() || '';
  } else if (domain) {
    const parts = domain.split('.');
    serviceName = parts[0]?.charAt(0).toUpperCase() + parts[0]?.slice(1) || '';
  }

  // Override for specific networks
  if (serviceName === 'X') serviceName = 'Twitter';
  if (serviceName === 'Bsky') serviceName = 'Bluesky';

  // Set up mounted state with delay to prevent mobile hydration issues
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 20); // Slightly longer delay for mobile-specific hydration

    return () => clearTimeout(timer);
  }, []);

  // State for both profile and domain OG images
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [domainImageUrl, setDomainImageUrl] = useState<string | null>(null);

  // Helper to get appropriate profile image based on network
  const getProfileFallbackImage = (networkLabel: string): string => {
    // Use exact URLs with try/catch to handle errors
    try {
      if (networkLabel.includes('GitHub')) {
        // Primary GitHub avatar
        return 'https://avatars.githubusercontent.com/u/99231285?v=4';
      }

      if (networkLabel.includes('X') || networkLabel.includes('Twitter')) {
        // Use local Twitter/X profile image
        return '/images/social-pics/x.jpg';
      }

      if (networkLabel.includes('LinkedIn')) {
        // Use local LinkedIn profile image
        return '/images/social-pics/linkedin.jpg';
      }

      if (networkLabel.includes('Bluesky')) {
        // Updated Bluesky avatar URL
        return 'https://cdn.bsky.app/img/avatar/plain/did:plc:6y3lzhinepgneechfrv3w55d/bafkreicuryva5uglksh2tqrc5tu66kwvnjwnpd2fdb6epsa6fjhhdehhyy@jpeg';
      }

      if (networkLabel.includes('Discord')) {
        // Use local Discord profile image
        return '/images/social-pics/discord.jpg';
      }
    } catch (error) {
      console.error(`Error getting profile image for ${networkLabel}:`, error);
      // Fall back to local version if anything fails
      if (networkLabel.includes('GitHub')) return '/images/social-pics/github.jpg';
      if (networkLabel.includes('X') || networkLabel.includes('Twitter')) return '/images/social-pics/x.jpg';
      if (networkLabel.includes('LinkedIn')) return '/images/social-pics/linkedin.jpg';
      if (networkLabel.includes('Bluesky')) return '/images/social-pics/bluesky.jpg';
      if (networkLabel.includes('Discord')) return '/images/social-pics/discord.jpg';
    }

    // Default fallback
    return '/images/william.jpeg';
  };

  // Helper to get appropriate domain banner image based on network
  const getDomainFallbackImage = (networkLabel: string): string => {
    if (networkLabel.includes('GitHub')) return '/images/social-banners/github.svg';
    if (networkLabel.includes('X') || networkLabel.includes('Twitter')) return '/images/social-banners/twitter-x.svg';
    if (networkLabel.includes('LinkedIn')) return '/images/social-banners/linkedin.svg';
    if (networkLabel.includes('Discord')) return '/images/social-banners/discord.svg';
    if (networkLabel.includes('Bluesky')) return '/images/social-banners/bluesky.png';
    return '/images/company-placeholder.svg';
  };

  // Fetch OG images with error handling and fallback - using useCallback to prevent infinite loops
  const fetchSocialImages = useCallback(async (url: string) => {
    // --- START LinkedIn Specific Handling ---
    if (label.includes('LinkedIn')) {
      console.log(`⭐ [${label}] Skipping API call, using local fallbacks directly.`);
      const fallbackProfile = getProfileFallbackImage(label);
      const fallbackBanner = getDomainFallbackImage(label);
      setProfileImageUrl(fallbackProfile);
      setDomainImageUrl(fallbackBanner);
      setIsLoading(false);
      setImageError(false); // Ensure error state is reset
      return; // Exit early, skip API call
    }
    // --- END LinkedIn Specific Handling ---

    try {
      setIsLoading(true);
      setImageError(false); // Reset error state

      // DIRECTLY USE SOCIAL BANNER FROM PUBLIC FOLDER - NO API CALL
      console.log(`⭐ [${label}] Using direct social banner from public folder`);

      // Set local banner image immediately - no API needed
      const localBanner = getDomainFallbackImage(label);
      console.log(`⭐ [${label}] Setting social banner: ${localBanner}`);
      setDomainImageUrl(localBanner);

      // Improved logging with network type
      console.log(`🔄 [${label}] Fetching profile image only from ${url}...`);

      // Only fetch profile image
      const apiUrl = `/api/og-image?url=${encodeURIComponent(url)}&fetchDomain=false`;
      const response = await fetch(apiUrl);

      // Define a proper interface for the API response structure
      interface OgImageApiResponse {
        profileImageUrl?: string;
        domainImageUrl?: string;
        // Add any other properties that might be returned
      }

      if (response.ok) {
        const data = await response.json() as OgImageApiResponse;
        console.log(`✅ [${label}] API response for profile:`, data);

        // Set profile image only
        if (data.profileImageUrl) {
          console.log(`🖼️ [${label}] Using profile image: ${data.profileImageUrl}`);
          setProfileImageUrl(data.profileImageUrl);
        } else {
          console.log(`⚠️ [${label}] No profile image found, using fallback`);
          const fallbackImage = getProfileFallbackImage(label);
          setProfileImageUrl(fallbackImage);
        }
      } else {
        console.error(`❌ [${label}] API request failed for profile: ${response.status}`);
        // Set fallbacks
        const fallbackImage = getProfileFallbackImage(label);
        setProfileImageUrl(fallbackImage);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ [${label}] Error: ${errorMessage}`);
      // Set fallbacks
      const fallbackImage = getProfileFallbackImage(label);
      const localBanner = getDomainFallbackImage(label);
      setProfileImageUrl(fallbackImage);
      setDomainImageUrl(localBanner);
    } finally {
      setIsLoading(false);
    }
  }, [label, setProfileImageUrl, setDomainImageUrl, setIsLoading, setImageError]);

  // Set banner immediately and fetch profile image when component mounts
  useEffect(() => {
    if (mounted) {
      setImageError(false);

      // ALWAYS set the banner image immediately from local files
      const localBanner = getDomainFallbackImage(label);
      console.log(`⭐ [${label}] Initial banner set: ${localBanner}`);
      setDomainImageUrl(localBanner);

      // Fetch profile image separately
      void fetchSocialImages(href);
    }
  }, [href, label, mounted, fetchSocialImages]);

  // Only render when mounted to prevent hydration mismatch
  if (!mounted) {
    return <div className="relative flex flex-col bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg ring-0 rounded-3xl overflow-hidden shadow-xl h-full"></div>;
  }

  // Determine brand-specific card styling
  const cardBrandClass =
    (label.includes('LinkedIn') || domain.includes('linkedin')) ? 'linkedin-card' :
    (label.includes('GitHub') || domain.includes('github')) ? 'github-card' :
    (label.includes('X') || label.includes('Twitter') || domain.includes('twitter') || domain.includes('x.com')) ? 'twitter-card' :
    (label.includes('Bluesky') || domain.includes('bsky')) ? 'bluesky-card' :
    (label.includes('Discord') || domain.includes('discord')) ? 'discord-card' : '';

  return (
    <div className={`relative flex flex-col bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg ring-0 rounded-3xl overflow-hidden shadow-xl border border-transparent group ${cardBrandClass} h-full`}>
      {/* Image Section with beautiful profile/domain overlay */}
      <div className="relative w-full aspect-video overflow-hidden rounded-t-3xl bg-gray-100 dark:bg-gray-800">
        {/* Loading state */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <div className="w-8 h-8 border-2 border-gray-400 border-t-blue-500 rounded-full animate-spin"></div>
          </div>
        )}

        {/* Combined creative banner + profile overlay */}
        <div className="absolute inset-0 w-full h-full overflow-hidden rounded-t-3xl">
          {/* Base domain branding image with hyperlink - covers the entire banner area */}
          {domainImageUrl && (
            <div className="absolute inset-0 w-full h-full overflow-hidden">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 z-20 w-full h-full cursor-pointer block"
              >
        {/* Transparent overlay for click handling */}
        <span className="sr-only">Visit {serviceName || 'social'} profile</span>
              </a>

              <div className={`absolute inset-0 w-full h-full`}>
                {domain.includes('linkedin') ? (
                  <Image
                    src={domainImageUrl}
                    alt={`${serviceName || 'Social media'} branding`}
                    className="w-full h-full object-cover linkedin-banner"
                    fill
                    unoptimized={true}
                    onLoad={() => {
                      // No JS style manipulation for now
                    }}
                    onError={() => {
                      console.error(`Error loading domain image for ${label}: ${domainImageUrl}`);
                      setImageError(true);
                    }}
                  />
                ) : (
                  <Image
                    src={domainImageUrl}
                    alt={`${serviceName || 'Social media'} branding`}
                    className="w-full h-full object-cover social-banner"
                    fill
                    unoptimized={true}
                    onError={() => {
                      console.error(`Error loading domain image for ${label}: ${domainImageUrl}`);
                      setImageError(true);
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Semi-transparent gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-transparent via-black/10 to-black/30 dark:from-transparent dark:via-black/20 dark:to-black/50"></div>

          {/* Profile image moved to bottom right, replacing network logo - now clickable */}
          {profileImageUrl && (
            <div className="absolute bottom-4 right-4 z-10">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="block relative w-12 h-12 md:w-16 md:h-16 cursor-pointer rounded-full"
              >
                {/* Profile image with better blending for bottom right */}
                <div className="absolute inset-0 rounded-full overflow-hidden shadow-lg border-2 border-white/70 dark:border-gray-700/70">
                  <Image
                    src={profileImageUrl}
                    alt={`${serviceName || 'Social media'} profile`}
                    fill
                    unoptimized={true}
                    priority={true}
                    sizes="(max-width: 767px) 48px, 64px"
                    className="object-cover"
                    onError={() => {
                      console.log(`Error loading profile image for ${label}: ${profileImageUrl}`);

                      // Use our existing helper function
                      const localFallback = getProfileFallbackImage(label);
                      console.log(`Using local fallback: ${localFallback}`);
                      setProfileImageUrl(localFallback);
                    }}
                  />
                </div>

                {/* Subtle glow for profile pic */}
                <div className="absolute -inset-1 -z-0 rounded-full bg-white/30 dark:bg-white/20 blur-sm"></div>
              </a>
            </div>
          )}
        </div>

        {/* Fallback to icon when both images failed or during loading */}
        {(!profileImageUrl || !domainImageUrl || imageError) && !isLoading && (
          <div className="absolute inset-0 z-5 flex items-center justify-center w-full h-full bg-gray-100 dark:bg-gray-800">
            <Icon className="w-32 h-32 text-gray-800 dark:text-gray-200" />
          </div>
        )}

        {/* Clickable domain overlay */}
        <ExternalLink
          href={href}
          showIcon={false}
          className="absolute bottom-3 left-3 bg-white/80 dark:bg-gray-800/80 px-3 py-1 flex items-center space-x-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <LucideExternalLinkIcon className="w-4 h-4 text-gray-700 dark:text-gray-200" />
          <span className="text-sm text-gray-700 dark:text-gray-200">{domain}</span>
        </ExternalLink>
      </div>

      {/* Content Section */}
      <div className="flex-1 p-6 flex flex-col gap-3.5">
        {/* Title with Icon - as a single clickable unit */}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 group/title"
          title={`Visit ${serviceName || 'social'} profile`}
        >
          <Icon className="w-6 h-6 text-gray-700 dark:text-gray-300 group-hover/title:text-blue-600 transition-colors" />
          <span className="text-2xl font-semibold text-gray-900 dark:text-white group-hover/title:text-blue-600 transition-colors">
            {serviceName}
          </span>
        </a>

        {/* Description - more detailed for social profiles */}
        <p className="flex-1 text-gray-700 dark:text-gray-300 text-base leading-6 overflow-hidden">
          {getNetworkDescription(label)}
        </p>

        {/* User handle - now as hyperlink with consistent styling */}
        <div className="mt-auto space-y-2 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:text-blue-600 transition-colors"
              title={`Visit ${serviceName || 'social'} profile`}
            >
              {getUserHandle(href)}
            </a>
          </div>
        </div>

        {/* Network tags */}
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

// Helper functions to generate content based on the social network
function getNetworkDescription(label: string): string {
  if (label.includes('GitHub')) return 'My code repositories and open source contributions.';
  if (label.includes('X') || label.includes('Twitter')) return 'Sharing thoughts on tech, startups, and investing while enjoying Twitter humor!';
  if (label.includes('LinkedIn')) return 'Obligatory LinkedIn updates and professional profile.';
  if (label.includes('Discord')) return 'Live chat and messaging on ~100 topic-based servers.';
  if (label.includes('Bluesky')) return 'Decentralized Twitter alternative.';
  return 'Connecting and sharing updates.';
}

function getNetworkCategory(label: string): string {
  if (label.includes('GitHub')) return 'Development';
  if (label.includes('X') || label.includes('Twitter') || label.includes('Bluesky')) return 'Social';
  if (label.includes('LinkedIn')) return 'Professional';
  if (label.includes('Discord')) return 'Community';
  return 'Social';
}

function getUserHandle(url: string): string {
  if (!url) return '';

  const parts = url.split('/');
  // Ensure handle is always a string by providing a default empty string
  const handle = parts.length > 0 ? parts[parts.length - 1] || '' : '';

  // If the URL structure is standard, return with @ prefix
  if (handle && !handle.includes('.')) {
    return `@${handle}`;
  }

  // For Bluesky's profile format
  if (url.includes('bsky.app/profile/')) {
    return `@${handle}`;
  }

  // For Discord's format
  if (url.includes('discord.com/users/')) {
    return handle;
  }

  // Ensure we always return a string
  return handle;
}
