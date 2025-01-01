/**
 * LogoImage Component
 * A React component that displays company/website logos with automatic fetching and caching
 *
 * Features:
 * - Automatic logo fetching from DuckDuckGo/Google services
 * - Support for direct logo URLs
 * - Loading states with placeholders
 * - Error handling with fallbacks
 * - SSR compatibility
 *
 * @module components/ui/logo-image
 */

"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { fetchLogo } from "../../lib/logo";

/**
 * Props for the LogoImage component
 */
interface LogoImageProps {
  /** Company name or website URL to fetch logo for */
  company: string;
  /** Optional direct URL to logo image */
  logoUrl?: string;
  /** Optional website URL to use for logo fetching */
  website?: string;
  /** Alt text for the image */
  alt?: string;
  /** Width of the image in pixels */
  width?: number;
  /** Height of the image in pixels */
  height?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * A component that displays a company or website logo
 * Can either use a provided logo URL or automatically fetch one
 *
 * @component
 * @example
 * // With direct logo URL
 * <LogoImage company="Google" logoUrl="https://..." />
 *
 * // With automatic fetching
 * <LogoImage company="Google" website="https://google.com" />
 *
 * // With minimal props (uses company name for fetching)
 * <LogoImage company="Google" />
 */
export function LogoImage({
  company,
  logoUrl,
  website,
  alt,
  width = 64,
  height = 64,
  className = "",
}: LogoImageProps) {
  // State for SSR and component lifecycle
  const [mounted, setMounted] = useState(false);
  const [dynamicLogoUrl, setDynamicLogoUrl] = useState<string | null>(logoUrl || null);
  const [error, setError] = useState<string | null>(null);

  // Handle SSR - only fetch logos on client side
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle logo fetching
  useEffect(() => {
    if (!mounted) return;

    // If a logo URL is provided directly, use that instead of fetching
    if (logoUrl) {
      setDynamicLogoUrl(logoUrl);
      return;
    }

    let active = true;

    async function loadLogo() {
      try {
        // Use website URL if available, otherwise use company name
        const result = await fetchLogo(website || company);
        if (active) {
          setDynamicLogoUrl(result.url);
          if (result.error) {
            setError(result.error);
          }
        }
      } catch (err) {
        if (active) {
          setError("Failed to load logo");
          console.error("Error loading logo:", err);
        }
      }
    }

    loadLogo();

    // Cleanup function to prevent setting state after unmount
    return () => {
      active = false;
    };
  }, [company, logoUrl, website, mounted]);

  // Log errors for debugging
  if (error) {
    console.warn(`Logo error for ${company}:`, error);
  }

  // Show nothing during SSR to prevent hydration mismatch
  if (!mounted) {
    return null;
  }

  // Show loading placeholder while fetching
  if (!dynamicLogoUrl) {
    return (
      <div
        className={`bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse ${className}`}
        style={{ width, height }}
        aria-label={`Loading ${company} logo`}
      />
    );
  }

  // Show the logo image
  return (
    <div className="rounded-lg overflow-hidden">
      <Image
        src={dynamicLogoUrl}
        alt={alt || `${company} logo`}
        width={width}
        height={height}
        className={`object-contain ${className}`}
        quality={95}
        unoptimized // Since we're loading external images
        style={{
          maxWidth: '100%',
          height: 'auto',
          objectFit: 'contain'
        }}
      />
    </div>
  );
}
