/**
 * LogoImage Component
 *
 * A client-side component for displaying a company logo image.
 * Uses next/image for both standard and data URLs to ensure performance
 * and consistency.
 *
 * @module components/ui/logo-image.client
 */

"use client";

import Image from "next/image";
import type React from "react";
import { useState, useCallback, useRef } from "react";
import type { LogoImageProps, OptimizedCardImageProps } from "@/types/ui/image";
import { getCompanyPlaceholder, COMPANY_PLACEHOLDER_BASE64 } from "@/lib/data-access/placeholder-images";

/**
 * Extract domain from a logo src so we can hit the on-demand logo API.
 * Handles both explicit `domain=` query param and CDN paths like `/logos/example.com.png`.
 */
function extractDomainFromSrc(url: string): string | null {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : undefined);
    const qp = parsed.searchParams.get("domain");
    if (qp) return qp;

    const match = parsed.pathname.match(/logos\/(.+?)\./);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function LogoImage({
  src,
  width,
  height,
  alt = "Company Logo",
  className = "",
  priority = false,
  needsInversion = false,
}: LogoImageProps & { needsInversion?: boolean }): React.JSX.Element {
  const [imageError, setImageError] = useState(false);
  const [reloadKey, setReloadKey] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const retryInitiated = useRef(false);

  const handleError = useCallback(() => {
    if (retryInitiated.current) {
      // We already retried once – fallback permanently to placeholder
      console.error(`[LogoImage] Final failure loading logo src: ${src}`);
      setImageError(true);
      setIsLoading(false);
      return;
    }

    retryInitiated.current = true;

    const domain = src ? extractDomainFromSrc(src) : null;
    if (domain) {
      // Fire and forget – trigger server fetch/upload with correct parameter and force refresh
      void fetch(`/api/logo?website=${encodeURIComponent(domain)}&forceRefresh=true`).catch(() => {
        /* silent */
      });
    }

    // Wait 3 s then retry the CDN URL with cache-buster
    setTimeout(() => {
      if (!src) {
        setImageError(true);
        setIsLoading(false);
        return;
      }
      console.warn(`[LogoImage] Retrying logo load with cache-buster: ${src}`);
      setReloadKey(Date.now());
    }, 3000);
  }, [src]);

  if (!src) {
    // Use company placeholder when no src is provided
    return (
      <Image
        src={getCompanyPlaceholder()}
        alt={alt}
        width={width}
        height={height}
        className={`${className} object-contain`}
        priority={priority}
      />
    );
  }

  // After an unrecoverable error, show company placeholder
  if (imageError) {
    return (
      <Image
        src={getCompanyPlaceholder()}
        alt={alt}
        width={width}
        height={height}
        className={`${className} object-contain`}
        priority={priority}
      />
    );
  }

  const displaySrc = reloadKey ? `${src}${src.includes("?") ? "&" : "?"}cb=${reloadKey}` : src;

  // Use next/image with base64 placeholder to prevent broken image flash
  return (
    <div style={{ position: "relative", width, height }} className="inline-block">
      {/* Base64 placeholder shown immediately while loading */}
      {isLoading && (
        <Image
          src={COMPANY_PLACEHOLDER_BASE64}
          alt={alt}
          width={width}
          height={height}
          className={`${className} object-contain`}
          style={{ position: "absolute", top: 0, left: 0 }}
          priority={priority}
          unoptimized
        />
      )}
      {/* Actual logo image */}
      <Image
        src={displaySrc}
        alt={alt}
        width={width}
        height={height}
        data-testid="next-image-mock"
        data-priority={priority ? "true" : "false"}
        className={`${className} object-contain ${needsInversion ? "dark:invert dark:brightness-90" : ""}`}
        style={{ opacity: isLoading ? 0 : 1, transition: "opacity 0.2s ease-in-out" }}
        {...(priority ? { priority } : {})}
        onError={handleError}
        onLoad={() => setIsLoading(false)}
        // Allow external images from the logo API
        unoptimized={!!src.includes("/api/logo")}
      />
    </div>
  );
}

// ------------------------------------------------------------------
// OptimizedCardImage – shared helper for cards (projects, bookmarks, blog)
// ------------------------------------------------------------------

import Placeholder from "@/public/images/opengraph-placeholder.png";

export function OptimizedCardImage({
  src,
  alt,
  className = "",
  logoDomain,
}: OptimizedCardImageProps): React.JSX.Element {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 1;

  // Detect if this is a proxy URL that needs special handling
  const isProxyUrl = src?.startsWith("/api/assets/") || src?.startsWith("/api/og-image");
  
  // For proxy URLs (especially screenshots), be more lenient with errors
  const shouldShowReal = src && (!errored || (isProxyUrl && retryCount < maxRetries));

  // No source provided - show placeholder
  if (!src) {
    return <Image src={Placeholder} alt={alt} fill placeholder="empty" className="object-cover" />;
  }

  // Source provided but errored after retries - show placeholder
  if (errored && (!isProxyUrl || retryCount >= maxRetries)) {
    // Log for debugging but don't spam with proxy URL retries
    if (!isProxyUrl || retryCount === 0) {
      console.warn(`[OptimizedCardImage] Failed to load image: ${src}, showing placeholder`);
    }
    return <Image src={Placeholder} alt={alt} fill placeholder="empty" className="object-cover" />;
  }

  // Real image case - includes screenshots and other proxy URLs
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(max-width:768px) 100vw, 50vw"
      quality={80}
      // Proxy URLs need unoptimized=true to bypass Next.js image optimization
      unoptimized={isProxyUrl}
      placeholder="empty"
      className={`object-cover transition-opacity duration-200 ${className}`}
      style={{ opacity: loaded ? 1 : 0.2 }}
      onLoad={() => {
        setLoaded(true);
        setErrored(false); // Clear error state on successful load
      }}
      onError={() => {
        // For proxy URLs, retry once before giving up
        if (isProxyUrl && retryCount < maxRetries) {
          console.log(`[OptimizedCardImage] Retrying proxy URL: ${src}`);
          setRetryCount(prev => prev + 1);
          // Force a re-render by toggling error state
          setErrored(false);
          setTimeout(() => setErrored(true), 100);
        } else {
          setErrored(true);
        }
      }}
    />
  );
}
