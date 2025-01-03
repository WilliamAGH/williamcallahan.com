/**
 * Logo Image Component
 * @note This is a Client Component because it needs to handle image loading states
 * @module components/ui/logo-image
 * @description
 * React component for displaying company logos with automatic theme-based inversion,
 * error handling, and fallback mechanisms. Supports both direct image URLs and API-based
 * logo fetching with automatic retries.
 *
 * @example
 * ```tsx
 * <LogoImage
 *   url="https://example.com/logo.png"
 *   width={100}
 *   height={50}
 *   enableInversion={true}
 *   showPlaceholder={true}
 *   website="example.com"
 * />
 * ```
 */

'use client';

import { useState, useEffect } from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import type { LogoDisplayOptions } from "../../types/logo";
/**
 * Props for the LogoImage component
 * @interface
 * @extends {LogoDisplayOptions}
 */
interface LogoImageProps extends LogoDisplayOptions {
  /**
   * URL of the logo to display
   * Can be a direct image URL or an API endpoint URL
   */
  url: string;

  /**
   * Width of the image in pixels
   * @min 1
   */
  width: number;

  /**
   * Height of the image in pixels
   * @min 1
   */
  height: number;

  /**
   * Optional website URL for API fallback
   * Used when the primary logo URL fails to load
   * @example "example.com"
   */
  website?: string;
}

/**
 * Logo Image Component
 * @component
 * @description Renders a company logo with automatic theme-based inversion and fallback handling
 *
 * Features:
 * - Automatic theme-based inversion for dark/light modes
 * - Fallback to API-based logo fetching on error
 * - Placeholder image display on final failure
 * - Lazy loading with priority for above-fold content
 *
 * @param {LogoImageProps} props - Component properties
 * @returns {JSX.Element} Rendered logo image component
 *
 * @example
 * ```tsx
 * // Basic usage
 * <LogoImage url="/logo.png" width={100} height={50} />
 *
 * // With all options
 * <LogoImage
 *   url="/logo.png"
 *   width={100}
 *   height={50}
 *   enableInversion={true}
 *   isDarkTheme={true}
 *   className="rounded-lg"
 *   alt="Company Name"
 *   showPlaceholder={true}
 *   website="example.com"
 * />
 * ```
 */
export function LogoImage({
  url,
  width,
  height,
  className = "",
  alt = "Company Logo",
  showPlaceholder = true,
  enableInversion = false,
  isDarkTheme,
  website
}: LogoImageProps): JSX.Element | null {
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<boolean>(false);
  const [triedApi, setTriedApi] = useState<boolean>(false);

  /**
   * Checks if a URL is an API endpoint URL
   * @param {string} url - URL to check
   * @returns {boolean} True if URL is an API endpoint
   */
  const isApiUrl = (url: string): boolean => url.startsWith("/api/logo");

  /**
   * Generates an API fallback URL for logo fetching
   * @param {string} website - Website domain for logo lookup
   * @returns {string} API URL for logo fetching
   * @throws {Error} If website parameter is empty
   */
  const getApiFallbackUrl = (website: string): string => {
    if (!website) {
      throw new Error("Website parameter is required for API fallback");
    }
    return `/api/logo?website=${encodeURIComponent(website)}`;
  };

  /**
   * Manages logo URL state and error handling
   * Uses server-side fetching as primary method
   */
  useEffect(() => {
    // Reset states when URL changes
    setError(false);
    setIsLoading(true);
    setTriedApi(false);

    if (!url) {
      setError(true);
      setIsLoading(false);
      return;
    }

    // If it's already an API URL, use it directly
    if (isApiUrl(url)) {
      setCurrentUrl(url);
      setIsLoading(false);
      return;
    }

    // For non-API URLs, try the local path first
    setCurrentUrl(url);
    setIsLoading(false);
  }, [url]);

  /**
   * Handles image load failures and implements fallback logic
   * Attempts to fetch from API if direct URL fails
   */
  const handleError = (): void => {
    // If we haven't tried the API yet and we have a website URL
    if (!triedApi && website && !isApiUrl(currentUrl)) {
      try {
        setTriedApi(true);
        setCurrentUrl(getApiFallbackUrl(website));
        return;
      } catch (err) {
        console.error("Failed to generate API fallback URL:", err);
      }
    }

    // If we've already tried the API or don't have a website URL, show placeholder
    setError(true);
    setIsLoading(false);
  };

  // Determine the final image URL based on component state
  const imageUrl = error || !currentUrl
    ? "/images/company-placeholder.svg"
    : currentUrl;

  /**
   * Determines the CSS classes for logo inversion based on theme settings
   * @returns {string} CSS classes for theme-based inversion
   */
  const getInversionClass = (): string => {
    if (!enableInversion) return "";
    return isDarkTheme ? "dark:invert" : "invert-0";
  };

  // Don't render anything if there's an error and showPlaceholder is false
  if (error && !showPlaceholder) {
    return null;
  }

  return (
    <Image
      src={imageUrl}
      alt={alt}
      width={width}
      height={height}
      className={`${className} ${error ? "opacity-50" : ""} ${getInversionClass()}`}
      onError={handleError}
      priority // Load immediately as logos are usually above the fold
    />
  );
}
