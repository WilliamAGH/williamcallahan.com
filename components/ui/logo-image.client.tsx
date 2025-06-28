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
}: LogoImageProps): React.JSX.Element {
  const [imageError, setImageError] = useState(false);
  const [reloadKey, setReloadKey] = useState<number | null>(null);
  const retryInitiated = useRef(false);

  const handleError = useCallback(() => {
    if (retryInitiated.current) {
      // We already retried once – fallback permanently to placeholder
      console.error(`[LogoImage] Final failure loading logo src: ${src}`);
      setImageError(true);
      return;
    }

    retryInitiated.current = true;

    const domain = src ? extractDomainFromSrc(src) : null;
    if (domain) {
      // Fire and forget – trigger server fetch/upload
      void fetch(`/api/logo?domain=${encodeURIComponent(domain)}`).catch(() => {
        /* silent */
      });
    }

    // Wait 3 s then retry the CDN URL with cache-buster
    setTimeout(() => {
      if (!src) {
        setImageError(true);
        return;
      }
      console.warn(`[LogoImage] Retrying logo load with cache-buster: ${src}`);
      setReloadKey(Date.now());
    }, 3000);
  }, [src]);

  if (!src) {
    // Return a placeholder or null if src is not provided
    return <div style={{ width, height }} className="bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />;
  }

  // After an unrecoverable error, show placeholder
  if (imageError) {
    return <div style={{ width, height }} className="bg-gray-200 dark:bg-gray-700 rounded" />;
  }

  const displaySrc = reloadKey ? `${src}${src.includes("?") ? "&" : "?"}cb=${reloadKey}` : src;

  // Use next/image for optimization when possible
  return (
    <Image
      src={displaySrc}
      alt={alt}
      width={width}
      height={height}
      data-testid="next-image-mock"
      data-priority={priority ? "true" : "false"}
      className={`${className} object-contain`}
      {...(priority ? { priority } : {})}
      onError={handleError}
      // Allow external images from the logo API
      unoptimized={!!src.includes("/api/logo")}
    />
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
  noLogoFallback = false,
  logoDomain,
}: OptimizedCardImageProps): React.JSX.Element {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // When src is null, we immediately fall back
  const shouldShowReal = src && !errored;

  if (!shouldShowReal && noLogoFallback) {
    // Plain placeholder (already imported static) fills
    return <Image src={Placeholder} alt={alt} fill placeholder="empty" className="object-cover" />;
  }

  if (!shouldShowReal && logoDomain) {
    return (
      <LogoImage
        src={`/api/logo?website=${encodeURIComponent(logoDomain)}`}
        width={130}
        height={80}
        alt={alt}
        className="object-contain max-w-[60%] max-h-[60%]"
      />
    );
  }

  // Real image case with placeholder first
  return (
    <Image
      src={shouldShowReal && src ? src : Placeholder}
      alt={alt}
      fill
      sizes="(max-width:768px) 100vw, 50vw"
      quality={80}
      unoptimized={!!shouldShowReal} // placeholder is local, real may be CDN
      placeholder="empty"
      className={`object-cover transition-opacity duration-200 ${className}`}
      style={{ opacity: loaded ? 1 : 0.2 }}
      onLoadingComplete={() => setLoaded(true)}
      onError={() => setErrored(true)}
    />
  );
}
